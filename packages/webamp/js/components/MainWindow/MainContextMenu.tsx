import { memo, Fragment, useEffect, useState } from "react";
const { ipcRenderer } = window.require('electron');
import * as Actions from "../../actionCreators";
import * as Selectors from "../../selectors";
import { LOAD_STYLE } from "../../constants";
import { Hr, Node, Parent, LinkNode } from "../ContextMenu";
import PlaybackContextMenu from "../PlaybackContextMenu";
import OptionsContextMenu from "../OptionsContextMenu";
import SkinsContextMenu from "../SkinsContextMenu";
import { FilePicker } from "../../types";
import { useTypedSelector, useActionCreator } from "../../hooks";

interface Props {
  filePickers: FilePicker[];
}

const MainContextMenu = memo(({ filePickers }: Props) => {
  const networkConnected = useTypedSelector(Selectors.getNetworkConnected);
  const genWindows = useTypedSelector(Selectors.getGenWindows);

  const close = useActionCreator(Actions.close);
  const openMediaFileDialog = useActionCreator(Actions.openMediaFileDialog);
  const loadMediaFiles = useActionCreator(Actions.loadMediaFiles);
  const toggleWindow = useActionCreator(Actions.toggleWindow);
  const menuOpened = useActionCreator(() => ({
    type: "MAIN_CONTEXT_MENU_OPENED",
  }));
  const [playlists, setPlaylists] = useState([]);
  const [playlistgetted, setPlaylistgetted] = useState(false);

  useEffect(() => {
    if (!playlistgetted) {
      ipcRenderer.invoke('getUserPlaylists').then((rs: any) => {
        setPlaylists(rs);
        setPlaylistgetted(true);
        console.log(rs);
        console.log(123);
      })
    }
    menuOpened();
  }, [menuOpened]);

  return (
    <Fragment>
      <LinkNode
        href="https://webamp.org/about"
        target="_blank"
        label="Yaamp..."
      />
      <Hr />
      <Parent label="Плейлисты">
        {playlists.map((playlist: any) => {
          return (
            <Node onClick={async () => {
              ipcRenderer.invoke("setPlaylist", {uid: playlist.uid, kind: playlist.kind }).then(() => {
                console.log('123');
              })
            }} label={playlist.title} />
          );
        })}
      </Parent>
      <Hr />
      {Object.keys(genWindows).map((i) => (
        <Node
          key={i}
          label={genWindows[i].title}
          checked={genWindows[i].open}
          onClick={() => toggleWindow(i)}
          hotkey={genWindows[i].hotkey}
        />
      ))}
      <Hr />
      <SkinsContextMenu />
      <Hr />
      <Parent label="Options">
        <OptionsContextMenu />
      </Parent>
      <Parent label="Playback">
        <PlaybackContextMenu />
      </Parent>
      <Hr />
      <Node onClick={close} label="Exit" />
    </Fragment>
  );
});

export default MainContextMenu;
