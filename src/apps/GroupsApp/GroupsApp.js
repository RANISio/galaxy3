import React, { Component, Fragment } from 'react';
import {Button} from "semantic-ui-react";
import LoginPage from '../../components/LoginPage';
import {client, getUser} from "../../components/UserManager";

class GroupsApp extends Component {

    state = {
        pass: false,
        user: null,
        roles: [],
    };

    componentDidMount() {
        getUser(cb => {
            if(cb) this.checkPermission(cb);
        });
    };

    checkPermission = (user) => {
        let gxy_public = user.roles.filter(role => role === 'bb_user').length === 0;
        if(!gxy_public) {
            this.setState({user, roles: user.roles});
        } else {
            alert("Access denied!");
            client.signoutRedirect();
        }
    };

    render() {

        const {user, roles} = this.state;

        let opt = roles.map((role,i) => {
            // if(role === "bb_user") return (<Button key={i} size='massive' color='green' onClick={() => window.open("https://galaxy.kli.one/stream")} >Stream</Button>);
            if(role === "gxy_group") return (<Button key={i} size='massive' color='green' onClick={() => window.open("https://galaxy.kli.one/group","_self")} >Group</Button>);
            if(role === "gxy_shidur") return (<Button key={i} size='massive' color='green' onClick={() => window.open("https://galaxy.kli.one/shidur","_self")} >Shidur</Button>);
            if(role === "gxy_sndman") return (<Button key={i} size='massive' color='green' onClick={() => window.open("https://galaxy.kli.one/sndman","_self")} >SoundMan</Button>);
            if(role === "gxy_admin") return (<Button key={i} size='massive' color='green' onClick={() => window.open("https://galaxy.kli.one/admin","_self")} >Admin</Button>);
            if(role === "gxy_root") return (<Button disabled key={i} size='massive' color='green' onClick={() => window.open("https://galaxy.kli.one/root","_self")} >Root</Button>);
            return false
        });

        return (

            <Fragment>
                <LoginPage user={user} enter={opt} />
            </Fragment>

        );
    }
}

export default GroupsApp;