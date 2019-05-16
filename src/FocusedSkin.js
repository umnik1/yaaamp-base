import React from "react";
import { connect } from "react-redux";
import WebampComponent from "./WebampComponent";
import FileExplorer from "./FileExplorer";
import DownloadLink from "./DownloadLink";
import * as Utils from "./utils";
import * as Selectors from "./redux/selectors";
import * as Actions from "./redux/actionCreators";
import { SCREENSHOT_HEIGHT, SCREENSHOT_WIDTH, SKIN_WIDTH } from "./constants";
import { delay } from "rxjs/operators";
import { Subject, combineLatest, timer, fromEvent } from "rxjs";
import Disposable from "./Disposable";

class FocusedSkin extends React.Component {
  constructor(props) {
    super(props);
    this._disposable = new Disposable();
    // TODO: Handle the case were we come from a permalink
    if (this.props.initialPosition == null) {
      this.state = Object.assign(
        {
          previewLoaded: false,
          loaded: false,
          transitionComplete: true,
          showLink: false
        },
        this._getCenteredState()
      );
    } else {
      this.state = {
        loaded: false,
        centered: false,
        transitionComplete: false,
        top: this.props.initialPosition.top,
        left: this.props.initialPosition.left,
        width: this.props.initialWidth,
        height: this.props.initialHeight,
        showLink: false
      };
    }
    this._webampLoadedEvents = new Subject();
    this._transitionBeginEvents = new Subject();
    const transitionComplete = this._transitionBeginEvents.pipe(delay(500));

    // Emit after both Webamp has loaded, and the transition is complete
    const startWebampFadein = combineLatest(
      this._webampLoadedEvents,
      transitionComplete
    );

    // This value matches the opacity transition timing for `#webamp` in CSS
    const webampFadeinComplete = startWebampFadein.pipe(delay(400));

    this._disposable.add(
      startWebampFadein.subscribe(() => {
        document.body.classList.add("webamp-loaded");
      }),
      webampFadeinComplete.subscribe(() => {
        this.setState({ loaded: true });
      }),
      () => {
        document.body.classList.remove("webamp-loaded");
      }
    );
  }

  componentDidMount() {
    this._disposable.add(
      fromEvent(window.document, "keydown").subscribe(e => {
        if (e.key === "ArrowRight") {
          this.props.selectRelativeSkin(1);
        } else if (e.key === "ArrowLeft") {
          this.props.selectRelativeSkin(-1);
        }
      })
    );
    if (!this.state.centered) {
      this._disposable.add(
        timer(0).subscribe(() => {
          // TODO: Observe DOM and recenter
          this.setState(this._getCenteredState());
          this._transitionBeginEvents.next(null);
        })
      );
    } else {
      this._transitionBeginEvents.next(null);
    }
  }

  componentDidUpdate(prevProps) {
    if (prevProps.skinUrl !== this.props.skinUrl) {
      document.body.classList.remove("webamp-loaded");
    }
  }

  componentWillUnmount() {
    this._disposable.dispose();
  }

  handleWebampLoaded = () => {
    this._webampLoadedEvents.next(null);
  };

  _getCenteredState() {
    // TODO: Observe DOM and recenter
    const { windowWidth, windowHeight } = Utils.getWindowSize();
    return {
      centered: true,
      top: (windowHeight - SCREENSHOT_HEIGHT) / 2,
      left: (windowWidth - SCREENSHOT_WIDTH) / 2,
      height: SCREENSHOT_HEIGHT,
      width: SCREENSHOT_WIDTH
    };
  }
  render() {
    const { loaded } = this.state;
    const transform = `translateX(${Math.round(
      this.state.left
    )}px) translateY(${Math.round(this.state.top)}px)`;

    return (
      <React.Fragment>
        {this.state.centered && (
          <>
            <div
              style={{
                position: "fixed",
                height: SCREENSHOT_HEIGHT,
                width: SCREENSHOT_WIDTH,
                transform
              }}
            >
              <WebampComponent
                key={this.props.hash} // Don't reuse instances
                skinUrl={Utils.skinUrlFromHash(this.props.hash)}
                loaded={this.handleWebampLoaded}
              />
            </div>
            {
              <FileExplorer
                skinUrl={Utils.skinUrlFromHash(this.props.hash)}
                style={{
                  width: "400px",
                  height: "100%",
                  top: 0,
                  transform: `translateX(${
                    this.props.fileExplorerOpen ? 0 : "-400px"
                  })`,
                  transition: "transform 200ms ease-out"
                }}
              />
            }
          </>
        )}
        <div
          id="focused-skin"
          style={{
            position: "fixed",
            height: this.state.height,
            width: this.state.width,
            transform,
            transition:
              "all 400ms ease-out, height 400ms ease-out, width 400ms ease-out"
          }}
        >
          <div style={{ width: "100%", height: "100%" }}>
            {loaded || (
              <img
                className={"focused-preview"}
                style={{
                  width: "100%",
                  height: "100%",
                  // Webamp measure the scrollHeight of the container. Making this a
                  // block element ensures the parent element's scrollHeight is not
                  // expanded.
                  display: "block",
                  opacity:
                    this.state.previewLoaded ||
                    this.props.initialPosition != null
                      ? 1
                      : 0,
                  transition: "opacity 0.2s ease-out"
                }}
                onLoad={() => this.setState({ previewLoaded: true })}
                src={this.props.fileName}
                alt={this.props.fileName}
              />
            )}
          </div>
        </div>
        <div className="metadata">
          {this.state.showLink && (
            <div>
              <input
                style={{
                  padding: "5px",
                  width: "300px",
                  marginBottom: "10px"
                }}
                ref={node => {
                  this._node = node;
                }}
                onFocus={e =>
                  e.target.setSelectionRange(0, e.target.value.length)
                }
                className="permalink-input"
                value={Utils.getAbsolutePermalinkUrlFromHash(this.props.hash)}
                readOnly
                autoFocus
              />
              <span
                style={{
                  fontSize: "18px",
                  marginLeft: "5px",
                  cursor: "pointer"
                }}
                onClick={() => this.setState({ showLink: false })}
              >
                &times;
              </span>
            </div>
          )}
          {this.props.fileName}
          {" ["}
          <DownloadLink
            href={Utils.skinUrlFromHash(this.props.hash)}
            download={this.props.fileName}
          >
            Download
          </DownloadLink>
          {"] ["}
          <a
            href={"#"}
            onClick={e => {
              this.props.openFileExplorer();
              e.preventDefault();
            }}
          >
            Readme
          </a>
          {"] ["}
          <a
            href={Utils.getAbsolutePermalinkUrlFromHash(this.props.hash)}
            onClick={e => {
              this.setState({ showLink: !this.state.showLink });
              e.preventDefault();
            }}
          >
            Share
          </a>
          {"] "}
        </div>
      </React.Fragment>
    );
  }
}

const mapStateToProps = (state, ownProps) => ({
  hash: Selectors.getSelectedSkinHash(state),
  initialPosition: Selectors.getSelectedSkinPosition(state),
  fileExplorerOpen: Selectors.getFileExplorerOpen(state),
  fileName: state.skins[ownProps.md5].fileName
});

const mapDispatchToProps = dispatch => ({
  selectRelativeSkin(offset) {
    dispatch(Actions.selectRelativeSkin(offset));
  },
  openFileExplorer() {
    dispatch(Actions.openFileExplorer());
  }
});

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(FocusedSkin);
