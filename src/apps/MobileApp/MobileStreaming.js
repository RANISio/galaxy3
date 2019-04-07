import React, { Component } from 'react';
import { Janus } from "../StreamApp/lib/janus";
import { Segment, Menu, Select, Button, Icon } from 'semantic-ui-react';
//import VolumeSlider from "../../components/VolumeSlider";
import {videos_options, audiog_options, gxycol, trllang, STUN_SRV_STR, JANUS_SRV_EURFR} from "../../shared/consts";
//import '../StreamApp/GalaxyStream.css'


class VirtualStreaming extends Component {

    state = {
        janus: null,
        videostream: null,
        audiostream: null,
        datastream: null,
        audio: null,
        videos: Number(localStorage.getItem("video")) || 1,
        audios: Number(localStorage.getItem("lang")) || 15,
        room: Number(localStorage.getItem("room")) || null,
        muted: false,
        vmuted: true,
        mixvolume: null,
        user: {},
        talking: null,
    };

    componentDidMount() {
        if(this.state.room) {
            fetch('https://v4g.kbb1.com/geo.php?action=get')
                .then((response) => {
                    if (response.ok) {
                        return response.json().then(
                            info => {
                                let {user} = this.state;
                                this.setState({user: {...info,...user}});
                                localStorage.setItem("extip", info.external_ip);
                                let server = `${JANUS_SRV_EURFR}`;
                                // if (info.country_code === "IL") {
                                //     server = 'https://v4g.kbb1.com/janustrl';
                                // } else {
                                //     server = (info.sessions > 400) ? 'https://jnsuk.kbb1.com/janustrl' : 'https://jnseur.kbb1.com/janustrl';
                                // }
                                this.initJanus(server);
                            }
                        );
                    }
                })
                .catch(ex => console.log(`get geoInfo`, ex));
        }
    };

    componentWillUnmount() {
        this.state.janus.destroy();
    };

    initJanus = (server) => {
        if(this.state.janus)
            this.state.janus.destroy();
        Janus.init({
            debug: ["error"],
            callback: () => {
                let janus = new Janus({
                    server: server,
                    iceServers: [{urls: STUN_SRV_STR}],
                    success: () => {
                        Janus.log(" :: Connected to JANUS");
                        this.setState({janus});
                        this.initVideoStream(janus);
                        this.initDataStream(janus);
                        this.initAudioStream(janus);
                    },
                    error: (error) => {
                        Janus.log(error);
                    },
                    destroyed: () => {
                        Janus.log("kill");
                    }
                });
            }
        })
    };

    initVideoStream = (janus) => {
        let {videos} = this.state;
        janus.attach({
            plugin: "janus.plugin.streaming",
            opaqueId: "videostream-"+Janus.randomString(12),
            success: (videostream) => {
                Janus.log(videostream);
                this.setState({videostream});
                //videostream.send({message: {request: "watch", id: videos}});
            },
            error: (error) => {
                Janus.log("Error attaching plugin: " + error);
            },
            onmessage: (msg, jsep) => {
                this.onStreamingMessage(this.state.videostream, msg, jsep, false);
            },
            onremotestream: (stream) => {
                Janus.log("Got a remote stream!", stream);
                let video = this.refs.remoteVideo;
                Janus.attachMediaStream(video, stream);
            },
            oncleanup: () => {
                Janus.log("Got a cleanup notification");
            }
        });
    };

    initAudioStream = (janus) => {
        let {audios} = this.state;
        janus.attach({
            plugin: "janus.plugin.streaming",
            opaqueId: "audiostream-"+Janus.randomString(12),
            success: (audiostream) => {
                Janus.log(audiostream);
                this.setState({audiostream}, () => {
                    this.audioMute();
                });
                audiostream.send({message: {request: "watch", id: audios}});
            },
            error: (error) => {
                Janus.log("Error attaching plugin: " + error);
            },
            onmessage: (msg, jsep) => {
                this.onStreamingMessage(this.state.audiostream, msg, jsep, false);
            },
            onremotestream: (stream) => {
                Janus.log("Got a remote stream!", stream);
                let audio = this.refs.remoteAudio;
                Janus.attachMediaStream(audio, stream);
            },
            oncleanup: () => {
                Janus.log("Got a cleanup notification");
            }
        });
    };

    initDataStream(janus) {
        janus.attach({
            plugin: "janus.plugin.streaming",
            opaqueId: "datastream-"+Janus.randomString(12),
            success: (datastream) => {
                Janus.log(datastream);
                this.setState({datastream});
                let body = { request: "watch", id: 101 };
                datastream.send({"message": body});
            },
            error: (error) => {
                Janus.log("Error attaching plugin: " + error);
            },
            onmessage: (msg, jsep) => {
                this.onStreamingMessage(this.state.datastream, msg, jsep, true);
            },
            ondataopen: () => {
                Janus.log("The DataStreamChannel is available!");
            },
            ondata: (data) => {
                let json = JSON.parse(data);
                Janus.log("We got data from the DataStreamChannel! ", json);
                this.checkData(json);
            },
            onremotestream: (stream) => {
                Janus.log("Got a remote stream!", stream);
            },
            oncleanup: () => {
                Janus.log("Got a cleanup notification");
            }
        });
    };

    initTranslationStream = (streamId) => {
        let {janus} = this.state;
        janus.attach({
            plugin: "janus.plugin.streaming",
            opaqueId: "trlstream-"+Janus.randomString(12),
            success: (trlstream) => {
                Janus.log(trlstream);
                this.setState({trlstream});
                trlstream.send({message: {request: "watch", id: streamId}});
            },
            error: (error) => {
                Janus.log("Error attaching plugin: " + error);
            },
            onmessage: (msg, jsep) => {
                this.onStreamingMessage(this.state.trlstream, msg, jsep, false);
            },
            onremotestream: (stream) => {
                Janus.log("Got a remote stream!", stream);
                let audio = this.refs.trlAudio;
                Janus.attachMediaStream(audio, stream);
                this.state.trlstream.getVolume();
                let talking = setInterval(this.ducerMixaudio, 200);
                this.setState({talking});
            },
            oncleanup: () => {
                Janus.log("Got a cleanup notification");
            }
        });
    };

    onStreamingMessage = (handle, msg, jsep, initdata) => {
        Janus.log("Got a message", msg);

        if(jsep !== undefined && jsep !== null) {
            Janus.log("Handling SDP as well...", jsep);

            // Answer
            handle.createAnswer({
                jsep: jsep,
                media: { audioSend: false, videoSend: false, data: initdata },
                success: function(jsep) {
                    Janus.log("Got SDP!", jsep);
                    let body = { request: "start" };
                    handle.send({message: body, jsep: jsep});
                },
                error: function(error) {
                    Janus.log("WebRTC error: " + error);
                }
            });
        }
    };

    checkData = (json) => {
        let {talk,col,name,ip} = json;
        if(localStorage.getItem("extip") === ip)
            this.streamGalaxy(talk,col,name);
    };

    streamGalaxy = (talk,col,name) => {
        if(talk) {
            let mixvolume = this.refs.remoteAudio.volume;
            this.setState({mixvolume, talking: true});
            let trlaudio = this.refs.trlAudio;
            trlaudio.volume = mixvolume;
            let body = { "request": "switch", "id": gxycol[col] };
            this.state.audiostream.send({"message": body});
            //attachStreamGalaxy(gxycol[json.col],gxyaudio);
            if(name.match(/^(newyork|toronto|chicago)$/)) {
                this.initTranslationStream(303);
            } else {
                this.initTranslationStream(trllang[localStorage.getItem("langtext")] || 303);
            }
            Janus.log("You now talking");
        } else if(this.state.talking) {
            Janus.log("Stop talking");
            clearInterval(this.state.talking);
            this.refs.remoteAudio.volume = this.state.mixvolume;
            let abody = { "request": "switch", "id": Number(localStorage.getItem("lang")) || 15};
            this.state.audiostream.send({"message": abody});
            let tbody = { "request": "stop" };
            this.state.trlstream.send({"message": tbody});
            this.state.trlstream.hangup();
            this.setState({talking: null});
        }
    };

    ducerMixaudio = () => {
        let volume = this.state.trlstream.getVolume();
        let audio = this.refs.remoteAudio;
        if (volume > 1000) {
            audio.volume = 0.2;
        } else if (audio.volume + 0.04 <= this.state.mixvolume) {
            audio.volume = audio.volume + 0.04;
        }
        //Janus.log(":: Trl level: " + volume + " :: Current mixvolume: " + audio.volume)
    };

    setVideo = (videos) => {
        this.setState({videos});
        this.state.videostream.send({message: { request: "switch", id: videos }});
        localStorage.setItem("video", videos);
    };

    setAudio = (audios,options) => {
        let text = options.filter(k => k.value === audios)[0].text;
        this.setState({audios});
        this.state.audiostream.send({message: {request: "switch", id: audios}});
        localStorage.setItem("lang", audios);
        localStorage.setItem("langtext", text);
    };

    setVolume = (value) => {
        this.refs.remoteAudio.volume = value;
    };

    audioMute = () => {
        const {audiostream,muted} = this.state;
        this.setState({muted: !muted});
        muted ? audiostream.muteAudio() : audiostream.unmuteAudio()
    };

    videoMute = (i) => {
        const {videostream,vmuted,videos} = this.state;
        console.log(":: VIDEOMUTE", i , vmuted)
        this.setState({vmuted: !vmuted});
        let request = vmuted ? "watch": "stop";
        videostream.send({message: {request, id: videos}});
    };

    toggleFullScreen = () => {
        let vid = this.refs.remoteVideo;
        vid.webkitEnterFullscreen();
    };


    render() {

        const {videos, audios, muted, talking} = this.state;

        return (

            <Segment secondary>
                <Segment textAlign='center' className="ingest_segment" raised>
                    <Menu secondary>
                        <Menu.Item>
                            <Button size='massive'
                                    icon labelPosition='left'
                                    floated='right'
                                    onClick={this.props.prev}>
                                <Icon name='left arrow' />
                                TEN
                            </Button>
                        </Menu.Item>
                        <Menu.Item>
                            <Select size='massive'
                                compact
                                error={!videos}
                                placeholder="Video:"
                                value={videos}
                                options={videos_options}
                                onChange={(e, {value}) => this.setVideo(value)}/>
                        </Menu.Item>
                        <Menu.Item>
                            <Select
                                compact={false}
                                scrolling={false}
                                error={!audios}
                                placeholder="Audio:"
                                value={audios}
                                options={audiog_options}
                                onChange={(e, {value, options}) => this.setAudio(value, options)}/>
                        </Menu.Item>
                        {/*<canvas ref="canvas1" id="canvas1" width="25" height="50"/>*/}
                    </Menu>
                </Segment>
                <Segment textAlign='center'>
                    <Button color='blue'
                            attached
                            floated='left'
                            size='massive'
                            icon='expand arrows alternate'
                            onClick={this.toggleFullScreen}/>
                    <video className={talking ? 'talk_border' : ''}
                           ref="remoteVideo"
                           id="remoteVideo"
                           width="640"
                           height="360"
                           autoPlay={true}
                           controls={false}
                           muted={true}
                           playsInline={true}/>
                    <Button positive={!muted}
                            negative={muted}
                            size='massive'
                            attached
                            floated='right'
                            icon={muted ? "volume off" : "volume up"}
                            onClick={this.audioMute}/>
                    <audio ref="remoteAudio"
                           id="remoteAudio"
                           autoPlay={true}
                           controls={false}
                           muted={muted}
                           playsInline={true}/>
                    <audio ref="trlAudio"
                           id="trlAudio"
                           autoPlay={true}
                           controls={false}
                        // muted={muted}
                           playsInline={true}/>
                </Segment>
                {/*<Grid columns={3}>*/}
                {/*    <Grid.Column width={2}>*/}
                {/*        <Button color='blue'*/}
                {/*                icon='expand arrows alternate'*/}
                {/*                onClick={this.toggleFullScreen}/>*/}
                {/*    </Grid.Column>*/}
                {/*    <Grid.Column width={12}>*/}
                {/*        <VolumeSlider volume={this.setVolume}/>*/}
                {/*    </Grid.Column>*/}
                {/*    <Grid.Column width={1}>*/}
                {/*        <Button positive={!muted}*/}
                {/*                negative={muted}*/}
                {/*                icon={muted ? "volume off" : "volume up"}*/}
                {/*                onClick={this.audioMute}/>*/}
                {/*    </Grid.Column>*/}
                {/*</Grid>*/}
            </Segment>
        );
    }
}

export default VirtualStreaming;
