import { combineEpics } from "redux-observable";
import { of, from, EMPTY, concat, timer, defer } from "rxjs";
import * as Actions from "./actionCreators";
import * as Selectors from "./selectors";
import * as Utils from "../utils";
import {
  tap,
  filter,
  switchMap,
  map,
  mergeMap,
  takeUntil,
  catchError,
  ignoreElements,
  distinctUntilChanged,
  startWith,
  exhaustMap,
  takeWhile,
  mergeAll,
} from "rxjs/operators";
import { search } from "../algolia";
import queryParser from "../queryParser";
import { API_URL, CHUNK_SIZE } from "../constants";
import * as UploadUtils from "../upload/uploadUtils";

const urlChangedEpic = (actions) =>
  actions.pipe(
    filter((action) => action.type === "URL_CHANGED"),
    switchMap((action) => {
      const pathname = action.location.pathname.replace(/\/$/, "");
      switch (pathname) {
        case "/about":
          return of(Actions.requestedAboutPage());
        case "/upload":
          return of(Actions.requestedUploadPage());
        case "/review":
          return of(Actions.requestedReviewPage());
        default:
        //
      }
      const params = new URLSearchParams(action.location.search);
      const query = params != null && params.get("query");

      if (
        action.location.pathname.startsWith("/skin/") ||
        // Temporary while we test out Cloudflare Workers to insert OG tags
        action.location.pathname.startsWith("/og_skin/")
      ) {
        const segments = action.location.pathname.split("/");
        const actions = [Actions.selectedSkin(segments[2])];
        if (segments[4] === "files") {
          actions.push(
            // For now this is always the readme, so we don't need it.
            // Actions.selectSkinFile(segments[5]),
            Actions.openFileExplorer()
          );
        }
        return of(...actions);
      }
      return of(Actions.searchQueryChanged(query || ""));
    })
  );

const selectedSkinEpic = (actions) =>
  actions.pipe(
    filter((action) => action.type === "SELECTED_SKIN"),
    switchMap((action) => {
      return defer(() => fetch(Utils.skinUrlFromHash(action.hash))).pipe(
        // TODO: Handle 404
        switchMap((response) => response.blob()),
        switchMap(async (blob) => {
          const JSZip = await import("jszip");
          return JSZip.loadAsync(blob);
        }),
        switchMap((zip) => {
          return of(Actions.loadedSkinZip(zip), {
            type: "SELECTED_SKIN_README",
          });
        }),
        catchError((e) => {
          console.error(e);
          return [];
        })
      );
    })
  );

const loadedSkinZipEpic = (actions) =>
  actions.pipe(
    filter((action) => action.type === "LOADED_SKIN_ZIP"),
    switchMap((action) => {
      // If a file is focused, but not yet loaded, try to load it now?
      return EMPTY;
    })
  );

const focusedSkinFileEpic = (actions, states) =>
  actions.pipe(
    filter((action) => action.type === "SELECTED_SKIN_FILE_TO_FOCUS"),
    switchMap(({ fileName, ext }) => {
      // TODO: Ensure this is never called with the wrong zip. Should this live in the "got zip" closure?
      const { skinZip } = states.value;
      if (skinZip == null) {
        // We don't have the skin zip yet. We trust that selectedSkinEpic will call this.
        return EMPTY;
      }

      const methodFromExt = {
        txt: "string",
        bmp: "blob",
        cur: "blob",
      };
      return from(skinZip.file(fileName).async(methodFromExt[ext])).pipe(
        map((content) => Actions.gotFocusedSkinFile(content))
      );
    })
  );

const selectSkinReadmeEpic = (actions, states) =>
  actions.pipe(
    filter((action) => action.type === "SELECTED_SKIN_README"),
    map(() => states.value.skinZip),
    filter(Boolean),
    map((skinZip) => {
      return Object.keys(skinZip.files).find((filename) => {
        return Utils.filenameIsReadme(filename);
      });
    }),
    switchMap((readmeFileName) => {
      return readmeFileName == null
        ? EMPTY
        : of(Actions.selectSkinFile(readmeFileName));
    })
  );

const searchEpic = (actions) =>
  actions.pipe(
    filter((action) => action.type === "SEARCH_QUERY_CHANGED"),
    switchMap(({ query }) => {
      if (query == null || query.length === 0) {
        return of(Actions.gotNewMatchingSkins(null));
      }

      const [newQuery, options] = queryParser(query);

      return from(search(newQuery, options)).pipe(
        map((content) => {
          const matchingSkins = content.hits.map((hit) => ({
            hash: hit.objectID,
            fileName: hit.fileName,
            // TODO: Some records still have float scores not booleans. Ignore those.
            nsfw: hit.nsfw === true || hit.nsfw === 1,
          }));
          return Actions.gotNewMatchingSkins(matchingSkins);
        })
      );
    })
  );

const randomSkinEpic = (actions, states) =>
  actions.pipe(
    filter((action) => action.type === "REQUESTED_RANDOM_SKIN"),
    map(() => Selectors.getRandomSkinHash(states.value)),
    map((md5) => {
      if (md5 == null) {
        return Actions.alert("No skins found.");
      }
      return Actions.selectedSkin(md5);
    })
  );

const alertEpic = (actions) =>
  actions.pipe(
    filter((action) => action.type === "ALERT"),
    tap(({ message }) => alert(message)),
    ignoreElements()
  );

const chunkState = {};

const unloadedSkinEpic = (actions, states) =>
  actions.pipe(
    filter((action) => action.type === "REQUEST_UNLOADED_SKIN"),
    mergeMap(async ({ index }) => {
      const chunk = Math.floor(index / (CHUNK_SIZE - 1));

      if (chunkState[chunk] != null) {
        return null;
      }
      chunkState[chunk] = "fetching";
      const response = await fetch(
        `${API_URL}/skins?offset=${chunk * CHUNK_SIZE}&first=${CHUNK_SIZE}`
      );

      // TODO: Handle 404

      const body = await response.json();
      return [body, chunk];
    }),
    filter(Boolean),
    mergeMap(([body, chunk]) => {
      return of(
        { type: "GOT_SKIN_CHUNK", chunk, payload: body.skins },
        { type: "GOT_TOTAL_NUMBER_OF_SKINS", number: body.skinCount }
      );
    })
  );

const selectRelativeSkinEpic = (actions, states) =>
  actions.pipe(
    filter((action) => action.type === "SELECT_RELATIVE_SKIN"),
    map((action) => {
      const hashes = Selectors.getMatchingSkinHashes(states.value);
      const currentIndex = hashes.indexOf(
        Selectors.getSelectedSkinHash(states.value)
      );
      const nextHash =
        hashes[Utils.clamp(0, hashes.length - 1, currentIndex + action.offset)];
      return Actions.selectedSkin(nextHash);
    })
  );

function takeUntilAction(actions, actionType) {
  return takeUntil(
    actions.pipe(filter((action) => action.type === actionType))
  );
}

const gotFilesEpic = (actions) =>
  actions.pipe(
    filter((action) => action.type === "GOT_FILES"),
    mergeMap(({ files }) => {
      return concat(
        of(Actions.toggleUploadView()),
        from(files.map((file) => Actions.gotFile(file, Utils.uniqueId())))
      ).pipe(takeUntilAction(actions, "CLOSE_UPLOAD_FILES"));
    })
  );

const uploadSingleFileEpic = (actions) =>
  actions.pipe(
    filter((action) => action.type === "GOT_FILE"),
    mergeMap(({ file, id }) => {
      if (!UploadUtils.isValidSkinFilename(file.name)) {
        return of(Actions.invalidFileExtension(id));
      }
      return from(UploadUtils.getSkinType(file))
        .pipe(
          mergeMap((skinType) => {
            if (skinType === null) {
              return of(Actions.invalidArchive(id));
            }
            return concat(
              of(Actions.gotSkinType(id, skinType)),
              from(UploadUtils.hashFile(file)).pipe(
                map((md5) => Actions.gotFileMd5(id, md5))
              )
            );
          })
        )
        .pipe(takeUntilAction(actions, "CLOSE_UPLOAD_FILES"));
    })
  );

const checkIfUploadsAreMissingEpic = (actions, state) =>
  actions.pipe(
    filter((action) => {
      return (
        (action.type === "GOT_FILE_MD5" ||
          action.type === "INVALID_FILE_EXTENSION" ||
          action.type === "INVALID_ARCHIVE") &&
        Selectors.getAreReadyToCheckMissingUploads(state.value)
      );
    }),
    mergeMap(() => {
      const files = Selectors.getUploadedFiles(state.value);
      return from(UploadUtils.getUploadUrls(files))
        .pipe(
          catchError((e) => {
            console.error("Failed fo check missing skins", e);
            // TODO: A real error here.
            alert(
              "Sorry. We had a problem checking which files are missing. Please contact jordan@jordaneldredge.com for help."
            );
            return of(Actions.closeUploadFiles());
          }),
          map((missingSkins) => {
            const found = [];
            const missing = [];

            Object.keys(files).forEach((md5) => {
              const data = missingSkins[md5];
              if (data == null) {
                found.push(md5);
              } else {
                missing[md5] = data;
              }
            });

            return Actions.gotMissingAndFoundMd5s({
              missing,
              found,
            });
          })
        )
        .pipe(takeUntilAction(actions, "CLOSE_UPLOAD_FILES"));
    })
  );

function uploadActions(file) {
  return concat(
    of(Actions.startingFileUpload(file.id)),
    defer(() => UploadUtils.upload(file)).pipe(
      map(() => Actions.uploadedSkin(file.id)),
      catchError((e) => {
        console.error(e);
        return of(Actions.uploadFailed(file.id));
      })
    )
  );
}

const uploadFilesEpic = (actions, state) =>
  actions.pipe(
    filter((action) => action.type === "TRY_TO_UPLOAD_FILE"),
    mergeMap(({ id }) => {
      const file = state.value.fileUploads[id];
      return uploadActions(file).pipe(
        takeUntilAction(actions, "CLOSE_UPLOAD_FILES")
      );
    })
  );

function getProcessingSkins(state) {
  return Object.values(state.fileUploads).filter(
    (file) => file.status === "UPLOADED"
  );
}

function checkStatus(state) {
  const processingSkins = getProcessingSkins(state);
  const processingMd5s = processingSkins.map((file) => file.md5);
  return defer(() => UploadUtils.checkMd5sUploadStatus(processingMd5s)).pipe(
    switchMap((statuses) => {
      // Map the status data to a (potentially empty) set of actions to update
      // our store.
      return Object.entries(statuses)
        .map(([md5, status]) => {
          const skin = processingSkins.find((file) => file.md5 === md5);
          if (skin == null) {
            console.warn(`Could not find a processing skin with hash ${md5}. `);
            return null;
          }
          switch (status) {
            case "ARCHIVED":
              return Actions.archivedSkin(skin.id);
            case "ERRORED":
              return Actions.uploadFailed(skin.id);
            default:
              return null;
          }
        })
        .filter(Boolean);
    })
  );
}

// Every time we complete uploading a skin to S3, we start polling the museum
// API to see which skins that are still processing have completed. We continue
// polling (ignoring any newly uploaded file events) until we know the outcome
// of every skin we've uploaded to S3.
const uploadStatusEpic = (actions, state) =>
  actions.pipe(
    filter((action) => action.type === "UPLOADED_SKIN"),
    exhaustMap(() => {
      // TODO: Should we timeout at some point?
      return timer(0, 4000).pipe(
        takeWhile(() => getProcessingSkins(state.value).length > 0),
        exhaustMap(() => checkStatus(state.value))
      );
    })
  );

// When TRY_TO_UPLOAD_ALL_FILES is dispatched, upload a file and recursively
// dispatch until no uploadable files are found
const uploadAllFilesEpic = (actions, state) =>
  actions.pipe(
    filter((action) => action.type === "TRY_TO_UPLOAD_ALL_FILES"),
    mergeMap(() => {
      const files = Selectors.getFilesToUpload(state.value);
      return from(files).pipe(
        map((file) => uploadActions(file)),
        mergeAll(10), // Limit to 10 concurrent uploads
        takeUntilAction(actions, "CLOSE_UPLOAD_FILES")
      );
    })
  );

const loggingEpic = (actions, state) =>
  actions.pipe(
    tap((action) => {
      // ga('send', 'event', [eventCategory], [eventAction], [eventLabel], [eventValue], [fieldsObject]);
      switch (action.type) {
        case "CONCENTS_TO_NSFW":
        case "DOES_NOT_CONCENT_TO_NSFW":
        case "CLOSE_UPLOAD_FILES":
        case "GOT_FILE_MD5":
        case "ARCHIVED_SKIN":
        case "TRY_TO_UPLOAD_FILE":
        case "UPLOAD_FAILED":
        case "STARTING_FILE_UPLOAD":
        case "TRY_TO_UPLOAD_ALL_FILES":
        case "INVALID_FILE_EXTENSION":
        case "GOT_FILE":
        case "GOT_MISSING_AND_FOUND_MD5S":
        case "REQUESTED_RANDOM_SKIN":
        case "MARK_NSFW":
        case "INVALID_ARCHIVE":
          window.fbq("track", action.type);
          window.ga("send", "event", "redux", action.type);
          break;
        default: {
        }
      }
      // Facebook requires a value for events that can be used to create
      // look-a-like audiences.
      if (action.type === "ARCHIVED_SKIN") {
        window.fbq("track", "SKIN_UPLOAD_CONVERSION", {
          value: 1,
          currency: "USD",
        });
      }
    }),
    ignoreElements()
  );

const urlEpic = (actions, state) => {
  return actions.pipe(
    map(() => Selectors.getUrl(state.value)),
    distinctUntilChanged(),
    startWith(window.location),
    tap((url) => {
      window.ga("set", "page", url);
      window.history.replaceState({}, Selectors.getPageTitle(state), url);
    }),
    ignoreElements()
  );
};

const skinDataEpic = (actions, state) => {
  return actions.pipe(
    filter((action) => action.type === "SELECTED_SKIN"),
    switchMap(({ hash }) => {
      const skinData = state.value.skins[hash];
      if (
        skinData == null ||
        skinData.fileName == null ||
        skinData.nsfw == null
      ) {
        return from(fetch(`${API_URL}/skins/${hash}`)).pipe(
          switchMap((response) => response.json()),
          map((body) => {
            return Actions.gotSkinData(hash, {
              md5: hash,
              fileName: body.fileName,
              nsfw: body.nsfw,
            });
          })
        );
      }
      return EMPTY;
    })
  );
};

const markNsfwEpic = (actions) => {
  return actions.pipe(
    filter((action) => action.type === "MARK_NSFW"),
    mergeMap(async ({ hash }) => {
      try {
        const response = await fetch(`${API_URL}/skins/${hash}/report`, {
          method: "POST",
          mode: "cors",
        });
        if (!response.ok) {
          throw new Error("Failed to report skin.");
        }
      } catch (e) {
        return Actions.alert(
          "Oops. Something went wrong. Please try again later."
        );
      }
      return Actions.alert("Thanks for reporting. We'll review this skin.");
    }),
    filter(Boolean)
  );
};

export default combineEpics(
  searchEpic,
  urlChangedEpic,
  selectedSkinEpic,
  focusedSkinFileEpic,
  randomSkinEpic,
  selectRelativeSkinEpic,
  selectSkinReadmeEpic,
  loadedSkinZipEpic,
  unloadedSkinEpic,
  gotFilesEpic,
  uploadFilesEpic,
  uploadAllFilesEpic,
  uploadStatusEpic,
  uploadSingleFileEpic,
  checkIfUploadsAreMissingEpic,
  urlEpic,
  loggingEpic,
  skinDataEpic,
  markNsfwEpic,
  alertEpic
);
