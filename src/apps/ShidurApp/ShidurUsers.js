import React, { Component } from 'react';
import { Janus } from "../../lib/janus";
import {Segment, Table, Icon} from "semantic-ui-react";
import {getState, putData, initJanus} from "../../shared/tools";
import {MAX_FEEDS} from "../../shared/consts";
import './ShidurUsers.css'
import './VideoConteiner.scss'
import nowebcam from './nowebcam.jpeg';
import {initGxyProtocol} from "../../shared/protocol";
import classNames from "classnames";

class ShidurUsers extends Component {

    state = {
        janus: null,
        rooms: [],
        index: 0,
        disabled_rooms: [],
        group: null,
        preview: {
            feeds: [],
            feedStreams: {},
            mids: [],
            name: "",
            room: "",
            users: {}
            },
        program: {
            feeds: [],
            feedStreams: {},
            mids: [],
            name: "",
            room: "",
            users: {}
            },
        protocol: null,
        quistions_queue: [],
        questions: {},
        myid: null,
        mypvtid: null,
        mystream: null,
        audio: null,
        muted: true,
        user: {
            session: 0,
            handle: 0,
            role: "shidur",
            display: "shidur",
            id: Janus.randomString(10),
            name: "shidur"
        },
        users: {},
    };

    componentDidMount() {
        initJanus(janus => {
            let {user} = this.state;
            user.session = janus.getSessionId();
            this.setState({janus,user});
            this.initVideoRoom(null, "preview");

            initGxyProtocol(janus, user, protocol => {
                this.setState({protocol});
            }, ondata => {
                Janus.log("-- :: It's protocol public message: ", ondata);
                this.onProtocolData(ondata);
            });

            getState('state/galaxy/pr4', (state) => {
                Janus.log(" :: Get State: ", state);
                let {room, name} = state;
                this.setState({program: {...this.state.program, room, name, state}});
                this.initVideoRoom(room, "program");
            });
        },er => {}, true);
        setInterval(() => this.getRoomList(), 10000 );

    };

    onProtocolData = (data) => {
        let {feeds,users,user,questions,quistions_queue,preview_room,program_room} = this.state;
        if(data.type === "question" && data.status) {
            questions[data.user.id] = data.user;
            quistions_queue.push(data);
            this.setState({quistions_queue,questions});
        } else if(data.type === "question" && !data.status) {
            if(questions[data.user.id]) {
                delete questions[data.user.id];
                this.setState({questions});
            }
            for(let i = 0; i < quistions_queue.length; i++){
                if(quistions_queue[i].user.id === data.user.id) {
                    quistions_queue.splice(i, 1);
                    this.setState({quistions_queue});
                    break
                }
            }
        }

        if (data.type === "question" && data.status && data.room === program_room && user.id !== data.user.id) {
            let rfid = users[data.user.id].rfid;
            for (let i = 1; i < feeds.program.length; i++) {
                if (feeds.program[i] !== null && feeds.program[i] !== undefined && feeds.program[i].rfid === rfid) {
                    feeds.program[i].question = true;
                    break
                }
            }
            this.setState({feeds});
        } else if (data.type === "question" && !data.status && data.room === program_room && user.id !== data.user.id) {
            let rfid = users[data.user.id].rfid;
            for (let i = 1; i < feeds.program.length; i++) {
                if (feeds.program[i] !== null && feeds.program[i] !== undefined && feeds.program[i].rfid === rfid) {
                    feeds.program[i].question = false;
                    break
                }
            }
            this.setState({feeds});
        }

        if(data.type === "question" && data.status && data.room === preview_room && user.id !== data.user.id) {
            let rfid = users[data.user.id].rfid;
            for (let i = 1; i < feeds.preview.length; i++) {
                if (feeds.preview[i] !== null && feeds.preview[i] !== undefined && feeds.preview[i].rfid === rfid) {
                    feeds.preview[i].question = true;
                    break
                }
            }
           this.setState({feeds});
        } else if(data.type === "question" && !data.status && data.room === preview_room && user.id !== data.user.id) {
            let rfid = users[data.user.id].rfid;
            for (let i = 1; i < feeds.preview.length; i++) {
                if (feeds.preview[i] !== null && feeds.preview[i] !== undefined && feeds.preview[i].rfid === rfid) {
                    feeds.preview[i].question = false;
                    break
                }
            }
            this.setState({feeds});
        }
    };

    componentWillUnmount() {
        this.state.janus.destroy();
    };

    getRoomList = () => {
        const {preview, disabled_rooms} = this.state;
        if (preview && preview.videoroom) {
            preview.videoroom.send({message: {request: "list"},
                success: (data) => {
                    let usable_rooms = data.list.filter(room => room.num_participants > 0);
                    var newarray = usable_rooms.filter((room) => !disabled_rooms.find(droom => room.room === droom.room));
                    newarray.sort((a, b) => {
                        // if (a.num_participants > b.num_participants) return -1;
                        // if (a.num_participants < b.num_participants) return 1;
                        if (a.description > b.description) return 1;
                        if (a.description < b.description) return -1;
                        return 0;
                    });
                    this.setState({rooms: newarray});
                    this.getFeedsList(newarray)
                }
            });
        }
    };

    //FIXME: tmp solution to show count without service users in room list
    getFeedsList = (rooms) => {
        rooms.forEach((room,i) => {
            if(room.num_participants > 0) {
                this.state.preview.videoroom.send({
                    message: {request: "listparticipants", "room": room.room},
                    success: (data) => {
                        Janus.log("Feeds: ", data.participants);
                        let count = data.participants.filter(p => JSON.parse(p.display).role === "user");
                        rooms[i].num_participants = count.length;
                        this.setState({rooms});
                    }
                });
            }
        })
    };

    newRemoteFeed = (h, subscription) => {
        this.state.janus.attach(
            {
                plugin: "janus.plugin.videoroom",
                opaqueId: "remotefeed_user",
                success: (pluginHandle) => {
                    let remoteFeed = pluginHandle;
                    Janus.log("Plugin attached! (" + remoteFeed.getPlugin() + ", id=" + remoteFeed.getId() + ")");
                    Janus.log("  -- This is a multistream subscriber",remoteFeed);
                    this.setState({ [h]:{...this.state[h], remoteFeed, creatingFeed: false}});
                    // We wait for the plugin to send us an offer
                    let subscribe = {request: "join", room: this.state[h].room, ptype: "subscriber", streams: subscription};
                    remoteFeed.send({ message: subscribe });
                },
                error: (error) => {
                    Janus.error("  -- Error attaching plugin...", error);
                },
                iceState: (state) => {
                    Janus.log("ICE state (remote feed) changed to " + state);
                },
                webrtcState: (on) => {
                    Janus.log("Janus says this WebRTC PeerConnection (remote feed) is " + (on ? "up" : "down") + " now");
                },
                slowLink: (uplink, nacks) => {
                    Janus.warn("Janus reports problems " + (uplink ? "sending" : "receiving") +
                        " packets on this PeerConnection (remote feed, " + nacks + " NACKs/s " + (uplink ? "received" : "sent") + ")");
                },
                onmessage: (msg, jsep) => {
                    Janus.log(" ::: Got a message (subscriber) :::");
                    Janus.log(msg);
                    let event = msg["videoroom"];
                    Janus.log("Event: " + event);
                    if(msg["error"] !== undefined && msg["error"] !== null) {
                        Janus.debug("-- ERROR: " + msg["error"]);
                    } else if(event !== undefined && event !== null) {
                        if(event === "attached") {
                            //this.setState({creatingFeed: false});
                            Janus.log("Successfully attached to feed in room " + msg["room"]);
                        } else if(event === "event") {
                            // Check if we got an event on a simulcast-related event from this publisher
                        } else {
                            // What has just happened?
                        }
                    }
                    if(msg["streams"]) {
                        // Update map of subscriptions by mid
                        let {mids} = this.state[h];
                        for(let i in msg["streams"]) {
                            let mindex = msg["streams"][i]["mid"];
                            //let feed_id = msg["streams"][i]["feed_id"];
                            mids[mindex] = msg["streams"][i];
                        }
                        this.setState({[h]: {...this.state[h], mids}});
                    }
                    if(jsep !== undefined && jsep !== null) {
                        Janus.debug("Handling SDP as well...");
                        Janus.debug(jsep);
                        // Answer and attach
                        this.state[h].remoteFeed.createAnswer(
                            {
                                jsep: jsep,
                                // Add data:true here if you want to subscribe to datachannels as well
                                // (obviously only works if the publisher offered them in the first place)
                                media: { audioSend: false, videoSend: false, data:true },	// We want recvonly audio/video
                                success: (jsep) => {
                                    Janus.debug("Got SDP!");
                                    Janus.debug(jsep);
                                    let body = { request: "start", room: this.state.room };
                                    this.state[h].remoteFeed.send({ message: body, jsep: jsep });
                                },
                                error: (error) => {
                                    Janus.error("WebRTC error:", error);
                                    Janus.debug("WebRTC error... " + JSON.stringify(error));
                                }
                            });
                    }
                },
                onlocaltrack: (track, on) => {
                    // The subscriber stream is recvonly, we don't expect anything here
                },
                onremotetrack: (track, mid, on) => {
                    Janus.log(" ::: Got a remote track event ::: (remote feed)");
                    Janus.log("Remote track (mid=" + mid + ") " + (on ? "added" : "removed") + ":", track);
                    // Which publisher are we getting on this mid?
                    let {mids} = this.state[h];
                    let feed = mids[mid].feed_id;
                    Janus.log(" >> This track is coming from feed " + feed + ":", mid);
                    if(!on) {
                        Janus.log(" :: Going to stop track :: " + feed + ":", mid);
                        //FIXME: Remove callback for audio track does not come
                        track.stop();
                        //FIXME: does we really need to stop all track for feed id?
                        return;
                    }
                    // If we're here, a new track was added
                    if(track.kind === "audio") {
                        // New audio track: create a stream out of it, and use a hidden <audio> element
                        // let stream = new MediaStream();
                        // stream.addTrack(track.clone());
                        // Janus.log("Created remote audio stream:", stream);
                        // let remoteaudio = this.refs["remoteAudio" + feed];
                        // Janus.attachMediaStream(remoteaudio, stream);
                    } else if(track.kind === "video") {
                        // New video track: create a stream out of it
                        let stream = new MediaStream();
                        stream.addTrack(track.clone());
                        Janus.log("Created remote video stream:", stream);
                        let node = h === "preview" ? "remoteVideo" : "programVideo";
                        let remotevideo = this.refs[node + feed];
                        Janus.attachMediaStream(remotevideo, stream);
                    } else {
                        Janus.log("Created remote data channel");
                    }
                },
                ondataopen: (data) => {
                    Janus.log("The DataChannel is available!(feed)");
                },
                ondata: (data) => {
                    Janus.debug("We got data from the DataChannel! (feed) " + data);
                    let msg = JSON.parse(data);
                    this.onRoomData(msg);
                    Janus.log(" :: We got msg via DataChannel: ",msg)
                },
                oncleanup: () => {
                    Janus.log(" ::: Got a cleanup notification (remote feed) :::");
                }
            });
    };

    subscribeTo = (h, subscription) => {
        // New feeds are available, do we need create a new plugin handle first?
        if (this.state[h].remoteFeed) {
            this.state[h].remoteFeed.send({message:
                    {request: "subscribe", streams: subscription}
            });
            return;
        }
        // We don't have a handle yet, but we may be creating one already
        if (this.state[h].creatingFeed) {
            // Still working on the handle
            setTimeout(() => {
                this.subscribeTo(h, subscription);
            }, 500);
        } else {
            // We don't creating, so let's do it
            this.setState({[h]: {...this.state[h], creatingFeed: true}});
            this.newRemoteFeed(h, subscription);
        }
    };

    unsubscribeFrom = (h, id) => {
        // Unsubscribe from this publisher
        let {mids,feeds,users,feedStreams} = this.state[h];
        let {remoteFeed} = this.state[h];
        for (let i=0; i<feeds.length; i++) {
            if (feeds[i].id === id) {
                console.log(" - Remove FEED: ", feeds[i]);
                Janus.log("Feed " + feeds[i] + " (" + id + ") has left the room, detaching");
                //TODO: remove mids
                delete users[feeds[i].display.id];
                delete feedStreams[id];
                feeds.splice(i, 1);
                // Send an unsubscribe request
                let unsubscribe = {
                    request: "unsubscribe",
                    streams: [{ feed: id }]
                };
                if(remoteFeed !== null)
                    remoteFeed.send({ message: unsubscribe });
                this.setState({[h]:{...this.state[h], feeds,users,feedStreams}});
                break
            }
        }
    };

    initVideoRoom = (roomid, h) => {
        // if(!this.state.room)
        //     return;
        if(this.state[h] && this.state[h].videoroom)
            this.state[h].videoroom.detach();
        this.state.janus.attach({
            plugin: "janus.plugin.videoroom",
            opaqueId: "preview_shidur",
            success: (videoroom) => {
                Janus.log(videoroom,this.state[h]);
                // hdl.room = roomid;
                this.setState({[h]: {...this.state[h], videoroom}});
                Janus.log("Plugin attached! (" + videoroom.getPlugin() + ", id=" + videoroom.getId() + ")", this.state[h]);
                Janus.log("  -- This is a publisher/manager");
                let {user} = this.state;

                if(roomid) {
                    let register = { "request": "join", "room": roomid, "ptype": "publisher", "display": JSON.stringify(user) };
                    videoroom.send({"message": register});
                } else {
                    // Get list rooms
                    this.getRoomList();
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
            },
            onmessage: (msg, jsep) => {
                this.onMessage(h, msg, jsep, false);
            },
            onlocalstream: (mystream) => {
                // We don't going to show us yet
                Janus.debug(" ::: Got a local stream :::", mystream);
            },
            onremotestream: (stream) => {
                // The publisher stream is sendonly, we don't expect anything here
            },
            oncleanup: () => {
                Janus.log(" ::: Got a cleanup notification: we are unpublished now :::");
            }
        });
    };

    // newRemoteFeed = (id, handle, talk) => {
    //     // A new feed has been published, create a new plugin handle and attach to it as a subscriber
    //     var remoteFeed = null;
    //     this.state.janus.attach(
    //         {
    //             plugin: "janus.plugin.videoroom",
    //             opaqueId: "remotefeed_shidur",
    //             success: (pluginHandle) => {
    //                 remoteFeed = pluginHandle;
    //                 remoteFeed.simulcastStarted = false;
    //                 //this.setState({remotefeed});
    //                 Janus.log("Plugin attached! (" + remoteFeed.getPlugin() + ", id=" + remoteFeed.getId() + ")");
    //                 Janus.log("  -- This is a subscriber");
    //                 // We wait for the plugin to send us an offer
    //                 let listen = { "request": "join", "room": this.state[handle].room, "ptype": "subscriber", "feed": id, "private_id": this.state.mypvtid };
    //                 remoteFeed.send({"message": listen});
    //             },
    //             error: (error) => {
    //                 Janus.error("  -- Error attaching plugin...", error);
    //             },
    //             onmessage: (msg, jsep) => {
    //                 Janus.debug(" ::: Got a message (subscriber) :::");
    //                 Janus.debug(msg);
    //                 let event = msg["videoroom"];
    //                 Janus.debug("Event: " + event);
    //                 if(msg["error"] !== undefined && msg["error"] !== null) {
    //                     Janus.debug(":: Error msg: " + msg["error"]);
    //                 } else if(event !== undefined && event !== null) {
    //                     if(event === "attached") {
    //                         // Subscriber created and attached
    //                         let {feeds,users,questions} = this.state;
    //                         for(let i=1;i<MAX_FEEDS;i++) {
    //                             if(feeds[handle][i] === undefined || feeds[handle][i] === null) {
    //                                 remoteFeed.rfindex = i;
    //                                 remoteFeed.rfid = msg["id"];
    //                                 remoteFeed.rfuser = JSON.parse(msg["display"]);
    //                                 remoteFeed.rfuser.rfid = msg["id"];
    //                                 if(questions[remoteFeed.rfuser.id]) {
    //                                     remoteFeed.question = true;
    //                                 }
    //                                 remoteFeed.talk = talk;
    //                                 feeds[handle][i] = remoteFeed;
    //                                 users[remoteFeed.rfuser.id] = remoteFeed.rfuser;
    //                                 break;
    //                             }
    //                         }
    //                         this.setState({feeds,users});
    //                         Janus.log("Successfully attached to feed " + remoteFeed.rfid + " (" + remoteFeed.rfuser + ") in room " + msg["room"]);
    //                     } else if(event === "event") {
    //                         // Check if we got an event on a simulcast-related event from this publisher
    //                         let substream = msg["substream"];
    //                         let temporal = msg["temporal"];
    //                         if((substream !== null && substream !== undefined) || (temporal !== null && temporal !== undefined)) {
    //                             if(!remoteFeed.simulcastStarted) {
    //                                 remoteFeed.simulcastStarted = true;
    //                                 // Add some new buttons
    //                                 //addSimulcastButtons(remoteFeed.rfindex, remoteFeed.videoCodec === "vp8");
    //                             }
    //                             // We just received notice that there's been a switch, update the buttons
    //                             //updateSimulcastButtons(remoteFeed.rfindex, substream, temporal);
    //                         }
    //                     } else {
    //                         // What has just happened?
    //                     }
    //                 }
    //                 if(jsep !== undefined && jsep !== null) {
    //                     Janus.debug("Handling SDP as well...");
    //                     Janus.debug(jsep);
    //                     // Answer and attach
    //                     remoteFeed.createAnswer(
    //                         {
    //                             jsep: jsep,
    //                             // Add data:true here if you want to subscribe to datachannels as well
    //                             // (obviously only works if the publisher offered them in the first place)
    //                             media: { audioSend: false, videoSend: false },	// We want recvonly audio/video
    //                             success: (jsep) => {
    //                                 Janus.debug("Got SDP!");
    //                                 Janus.debug(jsep);
    //                                 let body = { "request": "start", "room": this.state[handle].room };
    //                                 remoteFeed.send({"message": body, "jsep": jsep});
    //                             },
    //                             error: (error) => {
    //                                 Janus.error("WebRTC error:", error);
    //                             }
    //                         });
    //                 }
    //             },
    //             webrtcState: (on) => {
    //                 Janus.log("Janus says this WebRTC PeerConnection (feed #" + remoteFeed.rfindex + ") is " + (on ? "up" : "down") + " now");
    //             },
    //             onlocalstream: (stream) => {
    //                 // The subscriber stream is recvonly, we don't expect anything here
    //             },
    //             onremotestream: (stream) => {
    //                 Janus.debug("Remote feed #" + remoteFeed.rfindex, handle);
    //                 let node = handle === "preview" ? "remoteVideo" : "programVideo";
    //                 //let remotevideo = this.refs[node + remoteFeed.rfindex];
    //                 let remotevideo = this.refs[node + remoteFeed.rfid];
    //                 // if(remotevideo.length === 0) {
    //                 //     // No remote video yet
    //                 // }
    //                 Janus.attachMediaStream(remotevideo, stream);
    //                 var videoTracks = stream.getVideoTracks();
    //                 if(videoTracks === null || videoTracks === undefined || videoTracks.length === 0) {
    //                     // No remote video
    //                 } else {
    //                     // Yes remote video
    //                 }
    //                 // if(Janus.webRTCAdapter.browserDetails.browser === "chrome" || Janus.webRTCAdapter.browserDetails.browser === "firefox" ||
    //                 //     Janus.webRTCAdapter.browserDetails.browser === "safari") {
    //                 //     $('#curbitrate'+remoteFeed.rfindex).removeClass('hide').show();
    //                 //     bitrateTimer[remoteFeed.rfindex] = setInterval(function() {
    //                 //         // Display updated bitrate, if supported
    //                 //         var bitrate = remoteFeed.getBitrate();
    //                 //         $('#curbitrate'+remoteFeed.rfindex).text(bitrate);
    //                 //         // Check if the resolution changed too
    //                 //         var width = $("#remotevideo"+remoteFeed.rfindex).get(0).videoWidth;
    //                 //         var height = $("#remotevideo"+remoteFeed.rfindex).get(0).videoHeight;
    //                 //         if(width > 0 && height > 0)
    //                 //             $('#curres'+remoteFeed.rfindex).removeClass('hide').text(width+'x'+height).show();
    //                 //     }, 1000);
    //                 // }
    //             },
    //             oncleanup: () => {
    //                 Janus.log(" ::: Got a cleanup notification (remote feed " + id + ") :::");
    //             }
    //         });
    // };

    onMessage = (h, msg, jsep, initdata) => {
        console.log(" ::: Got a message (publisher) :::");
        console.log(msg);
        let event = msg["videoroom"];
        if(event !== undefined && event !== null) {
            if(event === "joined") {
                // Publisher/manager created, negotiate WebRTC and attach to existing feeds, if any
                let myid = msg["id"];
                let mypvtid = msg["private_id"];
                this.setState({myid ,mypvtid});
                Janus.log("Successfully joined room " + msg["room"] + " with ID " + myid);
                // Any new feed to attach to?
                if(msg["publishers"] !== undefined && msg["publishers"] !== null) {
                    let list = msg["publishers"];
                    let feeds = list.filter(feeder => JSON.parse(feeder.display).role === "user");
                    let {feedStreams,users} = this.state[h];
                    console.log(":: Got Pulbishers list: ", feeds);
                    if(feeds.length > 15) {
                        alert("Max users in this room is reached");
                        window.location.reload();
                    }
                    Janus.debug("Got a list of available publishers/feeds:");
                    console.log(list);
                    let subscription = [];
                    for(let f in feeds) {
                        let id = feeds[f]["id"];
                        let display = JSON.parse(feeds[f]["display"]);
                        let talk = feeds[f]["talking"];
                        let streams = feeds[f]["streams"];
                        feeds[f].display = display;
                        for (let i in streams) {
                            let stream = streams[i];
                            stream["id"] = id;
                            stream["display"] = display;
                        }
                        feedStreams[id] = {id, display, streams};
                        users[display.id] = display;
                        users[display.id].rfid = id;
                        //TODO: select only video mid here
                        subscription.push({
                            feed: id,	// This is mandatory
                            //mid: stream.mid		// This is optional (all streams, if missing)
                        });
                    }
                    this.setState({[h]:{...this.state[h], feeds,feedStreams,users}});
                    console.log(" :: SUBS: ",subscription);
                    if(subscription.length > 0)
                        this.subscribeTo(h, subscription);
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
                // Any info on our streams or a new feed to attach to?
                let {feedStreams,user,myid} = this.state;
                if(msg["streams"] !== undefined && msg["streams"] !== null) {
                    let streams = msg["streams"];
                    for (let i in streams) {
                        let stream = streams[i];
                        stream["id"] = myid;
                        stream["display"] = user;
                    }
                    feedStreams[myid] = {id: myid, display: user, streams: streams};
                    this.setState({feedStreams})
                } else if(msg["publishers"] !== undefined && msg["publishers"] !== null) {
                    let feed = msg["publishers"];
                    let {feeds,feedStreams,users} = this.state[h];
                    Janus.debug("Got a list of available publishers/feeds:");
                    console.log(feed);
                    let subscription = [];
                    for(let f in feed) {
                        let id = feed[f]["id"];
                        let display = JSON.parse(feed[f]["display"]);
                        if(display.role !== "user")
                            return;
                        let talk = feed[f]["talking"];
                        let streams = feed[f]["streams"];
                        feed[f].display = display;
                        for (let i in streams) {
                            let stream = streams[i];
                            stream["id"] = id;
                            stream["display"] = display;
                        }
                        feedStreams[id] = {id, display, streams};
                        users[display.id] = display;
                        users[display.id].rfid = id;
                        //TODO: select only video mid here
                        subscription.push({
                            feed: id,	// This is mandatory
                            //mid: stream.mid		// This is optional (all streams, if missing)
                        });
                    }
                    feeds.push(feed[0]);
                    this.setState({ [h]:{...this.state[h], feeds,feedStreams,users}});
                    if(subscription.length > 0)
                        this.subscribeTo(h, subscription);
                } else if(msg["leaving"] !== undefined && msg["leaving"] !== null) {
                    // One of the publishers has gone away?
                    var leaving = msg["leaving"];
                    Janus.log("Publisher left: " + leaving);
                    this.unsubscribeFrom(leaving);

                } else if(msg["unpublished"] !== undefined && msg["unpublished"] !== null) {
                    let unpublished = msg["unpublished"];
                    Janus.log("Publisher left: " + unpublished);
                    if(unpublished === 'ok') {
                        // That's us
                        this.state[h].videoroom.hangup();
                        return;
                    }
                    this.unsubscribeFrom(h, unpublished);

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
            this.state[h].videoroom.handleRemoteJsep({jsep: jsep});
        }
    };

    // onMessage = (handle, msg, jsep, initdata) => {
    //     Janus.debug(" ::: Got a message (publisher) :::");
    //     Janus.debug(msg);
    //     let event = msg["videoroom"];
    //     Janus.debug("Event: " + event);
    //     if(event !== undefined && event !== null) {
    //         if(event === "joined") {
    //             // Publisher/manager created, negotiate WebRTC and attach to existing feeds, if any
    //             let myid = msg["id"];
    //             let mypvtid = msg["private_id"];
    //             this.setState({myid ,mypvtid});
    //             Janus.log("Successfully joined room " + msg["room"] + " with ID " + myid);
    //             //this.publishOwnFeed(true);
    //             // Any new feed to attach to?
    //             if(msg["publishers"] !== undefined && msg["publishers"] !== null) {
    //                 let list = msg["publishers"];
    //                 let feeds_list = list.filter(feeder => JSON.parse(feeder.display).role === "user");
    //                 Janus.debug("Got a list of available publishers/feeds:");
    //                 Janus.debug(list);
    //                 for(let f in feeds_list) {
    //                     let id = list[f]["id"];
    //                     let display = JSON.parse(feeds_list[f]["display"]);
    //                     let talk = list[f]["talking"];
    //                     Janus.debug("  >> [" + id + "] " + display);
    //                     this.newRemoteFeed(id, handle, talk);
    //                 }
    //             }
    //         } else if(event === "talking") {
    //             let {feeds} = this.state;
    //             let id = msg["id"];
    //             //let room = msg["room"];
    //             Janus.log("User: "+id+" - start talking");
    //             for(let i=1; i<MAX_FEEDS; i++) {
    //                 if(feeds[handle][i] !== null && feeds[handle][i] !== undefined && feeds[handle][i].rfid === id) {
    //                     feeds[handle][i].talk = true;
    //                 }
    //             }
    //             this.setState({feeds});
    //         } else if(event === "stopped-talking") {
    //             let {feeds} = this.state;
    //             let id = msg["id"];
    //             //let room = msg["room"];
    //             Janus.log("User: "+id+" - stop talking");
    //             for(let i=1; i<MAX_FEEDS; i++) {
    //                 if(feeds[handle][i] !== null && feeds[handle][i] !== undefined && feeds[handle][i].rfid === id) {
    //                     feeds[handle][i].talk = false;
    //                 }
    //             }
    //             this.setState({feeds});
    //         } else if(event === "destroyed") {
    //             // The room has been destroyed
    //             Janus.warn("The room has been destroyed!");
    //         } else if(event === "event") {
    //             // Any new feed to attach to?
    //             if(msg["publishers"] !== undefined && msg["publishers"] !== null) {
    //                 let list = msg["publishers"];
    //                 Janus.debug("Got a list of available publishers/feeds:");
    //                 Janus.debug(list);
    //                 for(let f in list) {
    //                     let id = list[f]["id"];
    //                     let display = JSON.parse(list[f]["display"]);
    //                     Janus.debug("  >> [" + id + "] " + display);
    //                     if(display.role === "user")
    //                         this.newRemoteFeed(id, handle, false);
    //                 }
    //             } else if(msg["leaving"] !== undefined && msg["leaving"] !== null) {
    //                 // One of the publishers has gone away?
    //                 let {feeds} = this.state;
    //                 let leaving = msg["leaving"];
    //                 Janus.log("Publisher left: " + leaving);
    //                 var remoteFeed = null;
    //                 for(let i=1; i<MAX_FEEDS; i++) {
    //                     if(feeds[handle][i] != null && feeds[handle][i] !== undefined && feeds[handle][i].rfid === leaving) {
    //                         remoteFeed = feeds[handle][i];
    //                         break;
    //                     }
    //                 }
    //                 if(remoteFeed !== null) {
    //                     Janus.debug("Feed " + remoteFeed.rfid + " (" + remoteFeed.rfuser + ") has left the room, detaching");
    //                     // $('#remote'+remoteFeed.rfindex).empty().hide();
    //                     // $('#videoremote'+remoteFeed.rfindex).empty();
    //                     feeds[handle][remoteFeed.rfindex] = null;
    //                     remoteFeed.detach();
    //                 }
    //                 this.setState({feeds});
    //             } else if(msg["unpublished"] !== undefined && msg["unpublished"] !== null) {
    //                 // One of the publishers has unpublished?
    //                 let {feeds} = this.state;
    //                 let unpublished = msg["unpublished"];
    //                 Janus.log("Publisher left: " + unpublished);
    //                 if(unpublished === 'ok') {
    //                     // That's us
    //                     this.state[handle].hangup();
    //                     return;
    //                 }
    //                 var remoteFeed = null;
    //                 for(let i=1; i<MAX_FEEDS; i++) {
    //                     if(feeds[handle][i] !== null && feeds[handle][i] !== undefined && feeds[handle][i].rfid === unpublished) {
    //                         remoteFeed = feeds[handle][i];
    //                         break;
    //                     }
    //                 }
    //                 if(remoteFeed !== null) {
    //                     Janus.debug("Feed " + remoteFeed.rfid + " (" + remoteFeed.rfuser + ") has left the room, detaching");
    //                     // $('#remote'+remoteFeed.rfindex).empty().hide();
    //                     // $('#videoremote'+remoteFeed.rfindex).empty();
    //                     feeds[handle][remoteFeed.rfindex] = null;
    //                     remoteFeed.detach();
    //                 }
    //             } else if(msg["error"] !== undefined && msg["error"] !== null) {
    //                 if(msg["error_code"] === 426) {
    //                     Janus.log("This is a no such room");
    //                 } else {
    //                     Janus.log(msg["error"]);
    //                 }
    //             }
    //         }
    //     }
    //     if(jsep !== undefined && jsep !== null) {
    //         Janus.debug("Handling SDP as well...");
    //         Janus.debug(jsep);
    //         this.state[handle].handleRemoteJsep({jsep: jsep});
    //         // Check if any of the media we wanted to publish has
    //         // been rejected (e.g., wrong or unsupported codec)
    //         // var audio = msg["audio_codec"];
    //         // if(mystream && mystream.getAudioTracks() && mystream.getAudioTracks().length > 0 && !audio) {
    //         //     // Audio has been rejected
    //         //     toastr.warning("Our audio stream has been rejected, viewers won't hear us");
    //         // }
    //         // var video = msg["video_codec"];
    //         // if(mystream && mystream.getVideoTracks() && mystream.getVideoTracks().length > 0 && !video) {
    //         //     // Video has been rejected
    //         //     toastr.warning("Our video stream has been rejected, viewers won't see us");
    //         //     // Hide the webcam video
    //         //     $('#myvideo').hide();
    //         //     $('#videolocal').append(
    //         //         '<div class="no-video-container">' +
    //         //         '<i class="fa fa-video-camera fa-5 no-video-icon" style="height: 100%;"></i>' +
    //         //         '<span class="no-video-text" style="font-size: 16px;">Video rejected, no webcam</span>' +
    //         //         '</div>');
    //         // }
    //     }
    // };

    attachToPreview = (group, index) => {
        const {videoroom,remoteFeed} = this.state.preview;
        let room = group.room;
        let name = group.description;
        let h = "preview";
        if(this.state.preview.room === room)
            return;
        Janus.log(" :: Attaching to Preview: ",group);
        if(this.state.preview.room !== "") {
            let leave = {request : "leave"};
            if(remoteFeed)
                remoteFeed.send({"message": leave});
            videoroom.send({"message": leave});
        };
        this.setState({[h]:{...this.state[h], room, name, index}});
        Janus.log("-- :: Preview join to room: ", room);
        let register = { "request": "join", "room": room, "ptype": "publisher", "display": JSON.stringify(this.state.user) };
        videoroom.send({"message": register});

        // feeds.preview.forEach(feed => {
        //     if(feed) {
        //         Janus.log("-- :: Remove Feed: ", feed);
        //         feed.detach();
        //     }
        // });

        // feeds.preview = [];
        // this.setState({index, preview_room: room, preview_name: name, feeds});
        //this.initVideoRoom(room, "preview");
    };

    attachToProgram = () => {
        // let {feeds, room, name, group, rooms} = this.state.program;
        // if(!name)
        //     return;
        // feeds.program.forEach(feed => {
        //     if(feed) {
        //         Janus.log("-- :: Remove Feed: ", feed);
        //         feed.detach();
        //     }
        // });
        //
        // feeds.program = [];
        // this.setState({program_room: preview_room, program_name: preview_name, feeds});
        // this.initVideoRoom(preview_room, "program");
        //
        // // Save Program State
        // let pgm_state = { index: 0, room: preview_room, name: preview_name};
        // this.setState({pgm_state});
        // Janus.log(" :: Attaching to Program: ",preview_name,pgm_state);

        let {videoroom,remoteFeed} = this.state.program;
        const {room, name, index} = this.state.preview;
        let h = "program";
        if(this.state.program.room === room)
            return;
        //Janus.log(" :: Attaching to Program: ",group);
        if(this.state.program.room !== "") {
            let leave = {request : "leave"};
            if(remoteFeed)
                remoteFeed.send({"message": leave});
            videoroom.send({"message": leave});
        };
        this.setState({[h]:{...this.state[h], room, name}});
        Janus.log("-- :: Preview join to room: ", room);
        let register = { "request": "join", "room": room, "ptype": "publisher", "display": JSON.stringify(this.state.user) };
        videoroom.send({"message": register});

        let state = {room, name, index};
        putData(`state/galaxy/pr4`, state, (cb) => {
            Janus.log(":: Save to state: ",cb);
        });

        // Select next group
        let {rooms,group} = this.state;
        let i = rooms.length-1 < group.index+1 ? 0 :  group.index+1;
        this.selectGroup(rooms[i], i)
    };

    selectGroup = (group, i) => {
        group.index = i;
        this.setState({group});
        Janus.log(group);
        this.attachToPreview(group);
    };

    disableRoom = (e, data, i) => {
        e.preventDefault();
        if (e.type === 'contextmenu') {
            let {disabled_rooms} = this.state;
            disabled_rooms.push(data);
            this.setState({disabled_rooms});
            this.getRoomList();
        }
    };

    restoreRoom = (e, data, i) => {
        e.preventDefault();
        if (e.type === 'contextmenu') {
            let {disabled_rooms} = this.state;
            for(let i = 0; i < disabled_rooms.length; i++){
                if ( disabled_rooms[i].room === data.room) {
                    disabled_rooms.splice(i, 1);
                    this.setState({disabled_rooms});
                    this.getRoomList();
                }
            }
        }
    };


  render() {
      //Janus.log(" --- ::: RENDER ::: ---");
      const { feeds,program,preview,preview_room,preview_name,program_name,disabled_rooms,rooms,quistions_queue,pgm_state } = this.state;
      const width = "400";
      const height = "300";
      const autoPlay = true;
      const controls = false;
      const muted = true;
      const q = (<Icon color='red' name='question circle' />);

      let rooms_list = rooms.map((data,i) => {
          const {room, num_participants, description} = data;
          let chk = quistions_queue.filter(q => q.room === room);
          return (
              <Table.Row negative={program_name === description}
                         positive={preview_name === description}
                         disabled={num_participants === 0}
                         className={preview_room === room ? 'active' : 'no'}
                         key={room} onClick={() => this.selectGroup(data, i)}
                         onContextMenu={(e) => this.disableRoom(e, data, i)} >
                  <Table.Cell width={5}>{description}</Table.Cell>
                  <Table.Cell width={1}>{num_participants}</Table.Cell>
                  <Table.Cell width={1}>{chk.length > 0 ? q : ""}</Table.Cell>
              </Table.Row>
          )
      });

      let disabled_list = disabled_rooms.map((data,i) => {
          const {room, num_participants, description} = data;
          return (
              <Table.Row key={room} warning
                         onClick={() => this.selectGroup(data, i)}
                         onContextMenu={(e) => this.restoreRoom(e, data, i)} >
                  <Table.Cell width={5}>{description}</Table.Cell>
                  <Table.Cell width={1}>{num_participants}</Table.Cell>
                  <Table.Cell width={1}></Table.Cell>
              </Table.Row>
          )
      });

      let program_feeds = program.feeds.map((feed) => {
          if(feed) {
              let id = feed.id;
              let talk = false;
              let question = false;
              return (<div className="video"
                           key={"prov" + id}
                           ref={"provideo" + id}
                           id={"provideo" + id}>
                  <div className={classNames('video__overlay', {'talk' : talk})}>
                      {question ? <div className="question"><Icon name="question circle" size="massive"/></div>:''}
                      {/*<div className="video__title">{!talk ? <Icon name="microphone slash" size="small" color="red"/> : ''}{name}</div>*/}
                  </div>
                  <video className={talk ? "talk" : ""}
                         key={id}
                         ref={"programVideo" + id}
                         id={"programVideo" + id}
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

      let preview_feeds = preview.feeds.map((feed) => {
          if(feed) {
              let id = feed.id;
              let talk = feed.talk;
              let question = feed.question;
              return (<div className="video"
                           key={"prev" + id}
                           ref={"prevideo" + id}
                           id={"prevideo" + id}>
                  <div className={classNames('video__overlay', {'talk' : talk})}>
                      {question ? <div className="question"><Icon name="question circle" size="massive"/></div>:''}
                      {/*<div className="video__title">{!talk ? <Icon name="microphone slash" size="small" color="red"/> : ''}{name}</div>*/}
                  </div>
                  <video className={talk ? "talk" : ""}
                         key={id}
                         ref={"remoteVideo" + id}
                         id={"remoteVideo" + id}
                         poster={nowebcam}
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

        <Segment className="segment_conteiner">
          
          <Segment className="program_segment" color='red'>
              {/*<div className="shidur_overlay">{pgm_state.name}</div>*/}
              {/*{program}*/}
              <div className="shidur_overlay"><span>{program.name}</span></div>
              <div className="videos-panel">
                  <div className="videos">
                      <div className="videos__wrapper">{program_feeds}</div>
                  </div>
              </div>
          </Segment>

          <Segment className="preview_segment" color='green' onClick={this.attachToProgram} >
              {/*<div className="shidur_overlay">{preview_name}</div>*/}
              {/*{preview}*/}
              <div className="shidur_overlay"><span>{preview.name}</span></div>
              <div className="videos-panel">
                  <div className="videos">
                      <div className="videos__wrapper">{preview_feeds}</div>
                  </div>
              </div>
          </Segment>

          <Segment textAlign='center' className="group_list" raised>
              <Table selectable compact='very' basic structured className="admin_table" unstackable>
                  <Table.Body>
                      {rooms_list}
                  </Table.Body>
              </Table>
          </Segment>
            <Segment textAlign='center' className="disabled_list" raised>
                <Table selectable compact='very' basic structured className="admin_table" unstackable>
                    <Table.Body>
                        {disabled_list}
                    </Table.Body>
                </Table>
            </Segment>

        </Segment>
    );
  }
}

export default ShidurUsers;
