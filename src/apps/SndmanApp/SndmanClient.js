import React, { Component } from 'react';
import { Janus } from "../../lib/janus";
import {Button, Segment} from "semantic-ui-react";
import {getState, initJanus} from "../../shared/tools";
import '../SndmanClient.css';
import './VideoConteiner.scss'
import {DATA_PORT, JANUS_IP_EURND, JANUS_IP_EURUK, JANUS_IP_ISRPT, MAX_FEEDS, DANTE_IN_IP, SECRET} from "../../shared/consts";

class SndmanClient extends Component {

    state = {
        onoff_but: true,
        devices: [],
        forward: false,
        program: {room: null, name: ""},
        janus: null,
        feeds: [],
        rooms: [],
        room: "",
        videoroom: null,
        remotefeed: null,
        myid: null,
        mypvtid: null,
        mystream: null,
        audio: null,
        muted: true,
        vglist: {},
        data_forward: {},
        user: {},
        users: {},
    };

    componentDidMount() {
        document.addEventListener("keydown", this.onKeyPressed);
        //this.getVgList();
        initJanus(janus => {
            let {user} = this.state;
            user.session = janus.getSessionId();
            this.setState({janus,user});
            this.initVideoRoom();
        });
        setInterval(() => getState('state/galaxy/pr5', (program) => {
            //Janus.log(" :: Get State: ", program);
            if(JSON.stringify(program) !== JSON.stringify(this.state.program)) {
                this.setState({program});
                this.attachToPreview(program.room);
            }
        }), 1000 );
    };

    componentWillUnmount() {
        document.removeEventListener("keydown", this.onKeyPressed);
        this.state.janus.destroy();
    };

    // getVgList = () => {
    //     getSessions(cb => {
    //         let {vglist} = this.state;
    //         for(let i=0; i<cb.length; i++) {
    //             let s = cb[i];
    //             let cs = Object.values(vglist).filter(user => user.session === s);
    //             if(cs.length > 0) continue;
    //             getHandles(s,cb => {
    //                 for(let i=0; i<cb.length; i++) {
    //                     let h = cb[i];
    //                     getHandleInfo(s,h,cb => {
    //                         //let cur = {'name':cb , 'handle':h , 'session':s};
    //                         cb.handle = h;
    //                         cb.session = s;
    //                         vglist[cb.name] = cb;
    //                         this.setState({vglist});
    //                         //Janus.log(" :: VGLIST: ", vglist[cb.name]);
    //                         //vglist.push(cb);
    //                     });
    //                 }
    //             });
    //         }
    //     });
    // };

    initVideoRoom = (roomid) => {
        if(this.state.videoroom)
            this.state.videoroom.detach();
        this.state.janus.attach({
            plugin: "janus.plugin.videoroom",
            opaqueId: "videoroom_sdiout",
            success: (videoroom) => {
                Janus.log(videoroom);
                let {user} = this.state;
                user.handle = videoroom.getId();
                user.role = "sndman";
                user.display = "soundman";
                user.id = Janus.randomString(10);
                user.name = "sndman";
                this.setState({videoroom, user});
                Janus.log("Plugin attached! (" + videoroom.getPlugin() + ", id=" + videoroom.getId() + ")");
                Janus.log("  -- This is a publisher/manager");

                if(roomid) {
                    let register = { "request": "join", "room": roomid, "ptype": "publisher", "display": JSON.stringify(user) };
                    videoroom.send({"message": register});
                } else {
                    videoroom.send({"message": { "request":"list" },
                        success: (data) => {
                            Janus.log(" :: Got list of all rooms: ",data);
                            this.setState({rooms: data.list});
                        }
                    });
                }
            },
            error: (error) => {
                Janus.log("Error attaching plugin: " + error);
            },
            consentDialog: (on) => {
                Janus.debug("Consent dialog should be " + (on ? "on" : "off") + " now");
            },
            mediaState: (medium, on) => {
                Janus.log("Janus " + (on ? "started" : "stopped") + " receiving our " + medium);
            },
            webrtcState: (on) => {
                Janus.log("Janus says our WebRTC PeerConnection is " + (on ? "up" : "down") + " now");
                this.forwardOwnFeed(this.state.room);
            },
            onmessage: (msg, jsep) => {
                this.onMessage(this.state.videoroom, msg, jsep, false);
            },
            onlocalstream: (mystream) => {
                Janus.debug(" ::: Got a local stream :::");
            },
            onremotestream: (stream) => {
                // The publisher stream is sendonly, we don't expect anything here
            },
            oncleanup: () => {
                Janus.log(" ::: Got a cleanup notification: we are unpublished now :::");
            }
        });
    };

    newRemoteFeed = (id, talk) => {
        // A new feed has been published, create a new plugin handle and attach to it as a subscriber
        var remoteFeed = null;
        this.state.janus.attach(
            {
                plugin: "janus.plugin.videoroom",
                opaqueId: "remotefeed_sdiout",
                success: (pluginHandle) => {
                    remoteFeed = pluginHandle;
                    remoteFeed.simulcastStarted = false;
                    //this.setState({remotefeed});
                    Janus.log("Plugin attached! (" + remoteFeed.getPlugin() + ", id=" + remoteFeed.getId() + ")");
                    Janus.log("  -- This is a subscriber");
                    // We wait for the plugin to send us an offer
                    let listen = { "request": "join", "room": this.state.room, "ptype": "subscriber", "feed": id, "private_id": this.state.mypvtid };
                    remoteFeed.send({"message": listen});
                },
                error: (error) => {
                    Janus.error("  -- Error attaching plugin...", error);
                },
                onmessage: (msg, jsep) => {
                    Janus.debug(" ::: Got a message (subscriber) :::");
                    Janus.debug(msg);
                    let event = msg["videoroom"];
                    Janus.debug("Event: " + event);
                    if(msg["error"] !== undefined && msg["error"] !== null) {
                        Janus.debug(":: Error msg: " + msg["error"]);
                    } else if(event !== undefined && event !== null) {
                        if(event === "attached") {
                            // Subscriber created and attached
                            let {feeds,users} = this.state;
                            for(let i=1;i<MAX_FEEDS;i++) {
                                if(feeds[i] === undefined || feeds[i] === null) {
                                    remoteFeed.rfindex = i;
                                    remoteFeed.rfid = msg["id"];
                                    remoteFeed.rfuser = JSON.parse(msg["display"]);
                                    remoteFeed.rfuser.rfid = msg["id"];
                                    remoteFeed.talk = talk;
                                    feeds[i] = remoteFeed;
                                    users[remoteFeed.rfuser.id] = remoteFeed.rfuser;
                                    break;
                                }
                            }
                            this.setState({feeds,users});
                            Janus.log("Successfully attached to feed " + remoteFeed.rfid + " (" + remoteFeed.rfuser + ") in room " + msg["room"]);
                        } else if(event === "event") {
                            // Check if we got an event on a simulcast-related event from this publisher
                            let substream = msg["substream"];
                            let temporal = msg["temporal"];
                            if((substream !== null && substream !== undefined) || (temporal !== null && temporal !== undefined)) {
                                if(!remoteFeed.simulcastStarted) {
                                    remoteFeed.simulcastStarted = true;
                                }
                            }
                        } else {
                            // What has just happened?
                        }
                    }
                    if(jsep !== undefined && jsep !== null) {
                        Janus.debug("Handling SDP as well...");
                        Janus.debug(jsep);
                        // Answer and attach
                        remoteFeed.createAnswer(
                            {
                                jsep: jsep,
                                // Add data:true here if you want to subscribe to datachannels as well
                                // (obviously only works if the publisher offered them in the first place)
                                media: { audioSend: false, videoSend: false },	// We want recvonly audio/video
                                success: (jsep) => {
                                    Janus.debug("Got SDP!");
                                    Janus.debug(jsep);
                                    let body = { "request": "start", "room": this.state.room };
                                    remoteFeed.send({"message": body, "jsep": jsep});
                                },
                                error: (error) => {
                                    Janus.error("WebRTC error:", error);
                                }
                            });
                    }
                },
                webrtcState: (on) => {
                    Janus.log("Janus says this WebRTC PeerConnection (feed #" + remoteFeed.rfindex + ") is " + (on ? "up" : "down") + " now");
                    //this.getVgList();
                },
                onlocalstream: (stream) => {
                    // The subscriber stream is recvonly, we don't expect anything here
                },
                onremotestream: (stream) => {
                    Janus.debug("Remote feed #" + remoteFeed.rfindex);
                    let remotevideo = this.refs["remoteVideo" + remoteFeed.rfid];
                    Janus.attachMediaStream(remotevideo, stream);
                    var videoTracks = stream.getVideoTracks();
                    if(videoTracks === null || videoTracks === undefined || videoTracks.length === 0) {
                        // No remote video
                    } else {
                        // Yes remote video
                    }
                },
                oncleanup: () => {
                    Janus.log(" ::: Got a cleanup notification (remote feed " + id + ") :::");
                }
            });
    };

    publishOwnFeed = (useAudio) => {
        // Publish our stream
        let {videoroom} = this.state;

        videoroom.createOffer(
            {
                media: {  audio: false, video: false, data: true },	// Publishers are sendonly
                simulcast: false,
                success: (jsep) => {
                    Janus.debug("Got publisher SDP!");
                    Janus.debug(jsep);
                    let publish = { "request": "configure", "audio": false, "video": false, "data": true };
                    videoroom.send({"message": publish, "jsep": jsep});
                },
                error: (error) => {
                    Janus.error("WebRTC error:", error);
                    if (useAudio) {
                        this.publishOwnFeed(false);
                    } else {
                        Janus.error("WebRTC error... " + JSON.stringify(error));
                    }
                }
            });
    };

    forwardOwnFeed = (room) => {
        let {myid,videoroom,data_forward} = this.state;
        let isrip = `${JANUS_IP_ISRPT}`;
        let eurip = `${JANUS_IP_EURND}`;
        let ukip = `${JANUS_IP_EURUK}`;
        let dport = DATA_PORT;
        let isrfwd = { "request": "rtp_forward","publisher_id":myid,"room":room,"secret":`${SECRET}`,"host":isrip,"data_port":dport};
        let eurfwd = { "request": "rtp_forward","publisher_id":myid,"room":room,"secret":`${SECRET}`,"host":eurip,"data_port":dport};
        let eukfwd = { "request": "rtp_forward","publisher_id":myid,"room":room,"secret":`${SECRET}`,"host":ukip,"data_port":dport};
        videoroom.send({"message": isrfwd,
            success: (data) => {
                data_forward.isr = data["rtp_stream"]["data_stream_id"];
                Janus.log(" :: ISR Data Forward: ", data);
            },
        });
        videoroom.send({"message": eurfwd,
            success: (data) => {
                data_forward.eur = data["rtp_stream"]["data_stream_id"];
                Janus.log(" :: EUR Data Forward: ", data);
                this.setState({onoff_but: false});
            },
        });
        videoroom.send({"message": eukfwd,
            success: (data) => {
                data_forward.euk = data["rtp_stream"]["data_stream_id"];
                Janus.log(" :: EUK Data Forward: ", data);
            },
        });
    };

    onMessage = (videoroom, msg, jsep, initdata) => {
        Janus.debug(" ::: Got a message (publisher) :::");
        Janus.debug(msg);
        let event = msg["videoroom"];
        Janus.debug("Event: " + event);
        if(event !== undefined && event !== null) {
            if(event === "joined") {
                // Publisher/manager created, negotiate WebRTC and attach to existing feeds, if any
                let myid = msg["id"];
                let mypvtid = msg["private_id"];
                this.setState({myid ,mypvtid});
                Janus.log("Successfully joined room " + msg["room"] + " with ID " + myid);
                this.publishOwnFeed();
                // Any new feed to attach to?
                if(msg["publishers"] !== undefined && msg["publishers"] !== null) {
                    let list = msg["publishers"];
                    Janus.debug("Got a list of available publishers/feeds:");
                    Janus.debug(list);
                    for(let f in list) {
                        let id = list[f]["id"];
                        //let display = list[f]["display"];
                        let display = JSON.parse(list[f]["display"]);
                        let talk = list[f]["talking"];
                        let audio = list[f]["audio_codec"];
                        let video = list[f]["video_codec"];
                        Janus.debug("  >> [" + id + "] " + display + " (audio: " + audio + ", video: " + video + ")");
                        if(display.role === "user")
                            this.newRemoteFeed(id, talk);
                    }
                }
            } else if(event === "talking") {
                let {feeds} = this.state;
                let id = msg["id"];
                //let room = msg["room"];
                Janus.log("User: "+id+" - start talking");
                for(let i=1; i<MAX_FEEDS; i++) {
                    if(feeds[i] !== null && feeds[i] !== undefined && feeds[i].rfid === id) {
                        feeds[i].talk = true;
                    }
                }
                this.setState({feeds});
            } else if(event === "stopped-talking") {
                let {feeds} = this.state;
                let id = msg["id"];
                //let room = msg["room"];
                Janus.log("User: "+id+" - stop talking");
                for(let i=1; i<MAX_FEEDS; i++) {
                    if(feeds[i] !== null && feeds[i] !== undefined && feeds[i].rfid === id) {
                        feeds[i].talk = false;
                    }
                }
                this.setState({feeds});
            } else if(event === "destroyed") {
                // The room has been destroyed
                Janus.warn("The room has been destroyed!");
            } else if(event === "event") {
                // Any new feed to attach to?
                if(msg["publishers"] !== undefined && msg["publishers"] !== null) {
                    let list = msg["publishers"];
                    Janus.debug("Got a list of available publishers/feeds:");
                    Janus.debug(list);
                    for(let f in list) {
                        let id = list[f]["id"];
                        //let display = list[f]["display"];
                        let display = JSON.parse(list[f]["display"]);
                        let audio = list[f]["audio_codec"];
                        let video = list[f]["video_codec"];
                        Janus.debug("  >> [" + id + "] " + display + " (audio: " + audio + ", video: " + video + ")");
                        if(display.role === "user")
                            this.newRemoteFeed(id, false);
                    }
                } else if(msg["leaving"] !== undefined && msg["leaving"] !== null) {
                    // One of the publishers has gone away?
                    let {feeds} = this.state;
                    let leaving = msg["leaving"];
                    Janus.log("Publisher left: " + leaving);
                    let remoteFeed = null;
                    for(let i=1; i<MAX_FEEDS; i++) {
                        if(feeds[i] != null && feeds[i] !== undefined && feeds[i].rfid === leaving) {
                            remoteFeed = feeds[i];
                            break;
                        }
                    }
                    //let rf = feeds.filter(f => f.rfid === id)[0];
                    if(remoteFeed !== null) {
                        Janus.debug("Feed " + remoteFeed.rfid + " (" + remoteFeed.rfuser + ") has left the room, detaching");
                        let remotevideo = this.refs["remoteVideo" + remoteFeed.rfid];
                        remotevideo.remove();
                        feeds[remoteFeed.rfindex] = null;
                        remoteFeed.detach();
                        this.setState({feeds});
                    }
                } else if(msg["unpublished"] !== undefined && msg["unpublished"] !== null) {
                    // One of the publishers has unpublished?
                    let {feeds} = this.state;
                    let unpublished = msg["unpublished"];
                    Janus.log("Publisher left: " + unpublished);
                    if(unpublished === 'ok') {
                        // That's us
                        videoroom.hangup();
                        return;
                    }
                    let remoteFeed = null;
                    for(let i=1; i<MAX_FEEDS; i++) {
                        if(feeds[i] != null && feeds[i] !== undefined && feeds[i].rfid === unpublished) {
                            remoteFeed = feeds[i];
                            break;
                        }
                    }
                    // let rf = feeds.filter(f => f.rfid === id)[0];
                    if(remoteFeed !== null) {
                        Janus.debug("Feed " + remoteFeed.rfid + " (" + remoteFeed.rfuser + ") has left the room, detaching");
                        let remotevideo = this.refs["remoteVideo" + remoteFeed.rfid];
                        remotevideo.remove();
                        feeds[remoteFeed.rfindex] = null;
                        remoteFeed.detach();
                        this.setState({feeds});
                    }
                } else if(msg["error"] !== undefined && msg["error"] !== null) {
                    if(msg["error_code"] === 426) {
                        Janus.log("This is a no such room");
                    } else {
                        Janus.log(msg["error"]);
                    }
                }
            }
        }
        if(jsep !== undefined && jsep !== null) {
            Janus.debug("Handling SDP as well...");
            Janus.debug(jsep);
            videoroom.handleRemoteJsep({jsep: jsep});
        }
    };

    startForward = () => {
        const {feeds, room, videoroom} = this.state;
        Janus.log(" :: Start forward from room: ", room);
        let port = 5630;
        feeds.forEach((feed,i) => {
            if (feed !== null && feed !== undefined) {
                let forward = { "request": "rtp_forward","publisher_id":feed.rfid,"room":room,"secret":`${SECRET}`,"host":`${DANTE_IN_IP}`,"audio_port":port};
                videoroom.send({"message": forward,
                    success: (data) => {
                    Janus.log(":: Forward callback: ", data);
                        let streamid = data["rtp_stream"]["audio_stream_id"];
                        feeds[i].streamid = streamid;
                    },
                });
                port = port + 2;
            }
        });
        this.setState({feeds, forward: true});
    };

     stopForward = () => {
         const {feeds, room, videoroom} = this.state;
         Janus.log(" :: Stop forward from room: ", room);
         feeds.forEach((feed,i) => {
             if (feed !== null && feed !== undefined) {
                 let stopfw = { "request":"stop_rtp_forward","stream_id":feed.streamid,"publisher_id":feed.rfid,"room":room,"secret":`${SECRET}` };
                 videoroom.send({"message": stopfw,
                     success: (data) => {
                         Janus.log(":: Forward callback: ", data);
                         feeds[i].streamid = null;
                     },
                 });
             }
         });
         this.setState({feeds, forward: false});
    };

     listForward = (room) => {
         const {videoroom} = this.state;
         let req = {"request":"listforwarders", "room":room, "secret":`${SECRET}`}
         videoroom.send ({"message": req,
             success: (data) => {
                Janus.log(" :: List forwarders: ", data);
            }
         })
     };

    sendMessage = (user, talk) => {
        let {videoroom,room} = this.state;
        var message = `{"talk":${talk},"name":"${user.display}","ip":"${user.ip}","col":4,"room":${room}}`;
        Janus.log(":: Sending message: ",message);
        videoroom.data({ text: message })
    };

    forwardStream = () => {
        const {feeds, room, videoroom, forward} = this.state;
        // TODO: WE need solution for joining users to already forwarded room
        if(forward) {
            Janus.log(" :: Stop forward from room: ", room);
            feeds.forEach((feed,i) => {
                if (feed !== null && feed !== undefined) {
                    // FIXME: if we change sources on client based on room id (not ip) we send message only once
                    this.sendMessage(feed.rfuser, false);
                    let stopfw = { "request":"stop_rtp_forward","stream_id":feed.streamid,"publisher_id":feed.rfid,"room":room,"secret":`${SECRET}` };
                    videoroom.send({"message": stopfw,
                        success: (data) => {
                            Janus.log(":: Forward callback: ", data);
                            feeds[i].streamid = null;
                        },
                    });
                }
            });
            this.setState({feeds, forward: false});
        } else {
            Janus.log(" :: Start forward from room: ", room);
            let port = 5630;
            feeds.forEach((feed,i) => {
                if (feed !== null && feed !== undefined) {
                    this.sendMessage(feed.rfuser, true);
                    let forward = { "request": "rtp_forward","publisher_id":feed.rfid,"room":room,"secret":`${SECRET}`,"host":"10.66.23.104","audio_port":port};
                    videoroom.send({"message": forward,
                        success: (data) => {
                            Janus.log(":: Forward callback: ", data);
                            let streamid = data["rtp_stream"]["audio_stream_id"];
                            feeds[i].streamid = streamid;
                        },
                    });
                    port = port + 2;
                }
            });
            this.setState({feeds, forward: true});
        }
    };

    registerUsername = (room) => {
        const {videoroom} = this.state;
        let register = { "request": "join", "room": room, "ptype": "publisher", "display": "user_"+Janus.randomString(4) };
        videoroom.send({"message": register});
        this.setState({room});
    };

    attachToPreview = (room) => {
        const {feeds, videoroom} = this.state;
        //this.listForward(room);
        if (this.state.room === room)
            return;
        this.setState({onoff_but: true});
        Janus.log(" :: Attaching to Preview: ", room);
        feeds.forEach(feed => {
            if (feed !== null && feed !== undefined) {
                this.sendMessage(feed.rfuser, false);
                if(feed.streamid) {
                    this.setState({forward: false});
                    let stopfw = { "request":"stop_rtp_forward","stream_id":feed.streamid,"publisher_id":feed.rfid,"room":this.state.room,"secret":`${SECRET}` };
                    videoroom.send({"message": stopfw,
                        success: (data) => {
                            Janus.log(":: Forward callback: ", data);
                        },
                    });
                }
                Janus.log("-- :: Remove Feed: ",feed);
                feed.detach();
            }
        });
        this.setState({room, feeds: []});
        this.initVideoRoom(room);
    };

    onKeyPressed = (e) => {
        if(e.code === "Numpad4" && !this.state.onoff_but)
            this.forwardStream();
    };


  render() {
      //Janus.log(" --- ::: RENDER ::: ---");
      const { name } = this.state.program;
      const { forward,onoff_but } = this.state;
      const width = "400";
      const height = "300";
      const autoPlay = true;
      const controls = false;
      const muted = true;

      let preview = this.state.feeds.map((feed) => {
          if(feed) {
              let id = feed.rfid;
              let talk = feed.talk;
              return (<div className="video"
                  key={"v" + id}
                  ref={"video" + id}
                  id={"video" + id}>
                  <video className={talk ? "talk" : ""}
                         key={id}
                         ref={"remoteVideo" + id}
                         id={"remoteVideo" + id}
                         width={width}
                         height={height}
                         autoPlay={autoPlay}
                         controls={controls}
                         muted={muted}
                         playsInline={true}/>
              </div>);
          }
          return true;
      });

    return (

        <Segment className="segment_snd" color='blue' raised>
            <Segment className="preview_snd">
            <div className="wrapper">
                <div className="title"><span>{name}</span></div>
                <div className="videos">
                    <div className="videos__wrapper">{preview}</div>
                </div>
            </div>
            </Segment>
            <Button size='big' disabled={onoff_but}
                    positive={!forward}
                    negative={forward}
                    onKeyDown={(e) => this.onKeyPressed(e)}
                    onClick={this.forwardStream}>{forward ? "Stop " : "Start"} talk</Button>
            {/*<Button size='big' positive={!muted}*/}
                    {/*negative={muted}*/}
                    {/*icon={muted ? "volume off" : "volume up"}*/}
                    {/*onClick={this.stopForward}>Stop talk</Button>*/}
        </Segment>
    );
  }
}

export default SndmanClient;
