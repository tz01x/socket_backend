const { Socket, Namespace } = require("socket.io");
const fetch = require('node-fetch');

const BACKEND_API = process.env.API_ENDPOINT + '/api/afternet'

const BACKEND_API_DEFAULT_HEADER = {
    'Content-Type': 'application/json',
}

async function saveMessage(data) {
    try {

        const response = await fetch(`${BACKEND_API}/add-message`, {
            method: 'POST',
            body: JSON.stringify(data),
            headers: BACKEND_API_DEFAULT_HEADER
        });
        return { 'detail': 'success', 'data': await response.json() }

    } catch (error) {
        console.log('[error]', error)
        return { detail: 'error', 'data': error }
    }
}

async function get_user_info(uid) {
    try {
        const response = await fetch(BACKEND_API + '/get-user/' + uid, {
            method: 'GET',
            headers: BACKEND_API_DEFAULT_HEADER
        });

        return { detail: 'success', 'data': await response.json() }
    } catch (error) {
        return { detail: 'error', 'data': error }
    }
}


/**
 * if u2 remove u1 from u2 friend list;
 * @param {string} uid1 
 * @param {string} uid2 
 * @returns {Promise<boolean>}
 */
async function hasRemove(uid1, uid2) {
    try {
        const response = await fetch(`${process.env.API_ENDPOINT}/afternet/has-remove`, {
            method: 'POST',
            body: JSON.stringify({
                uid_first: uid1,
                uid_second: uid2
            }),
            headers: {
                'Content-Type': 'application/json'
            }
        });
        const jData = await response.json();
        console.log(jData);
        return jData?.hasRemoved;
    } catch (error) {
        return true;
    }
}

const socketIdToUid = {};
const uidActiveMapper = {};


class AfterNetSocket {
    /**
     * 
     * @param {Namespace} io 
     * @param {Socket} socket 
     * @returns 
     */
    constructor(io, socket) {
        this.io = io;
        this.socket = socket;
        this.roomId = ''
        this.uid = null;
        this.user = null;
        this.connected_with_uid = null;
        this.hasRemoved = true;
        console.log('[AfterNet.newInstanceCreated] ', socket.id);
        this.markEventFunctions();

    }

    async on_setRoom(data) {
        const { roomId, uid, connected_with_uid } = data;
        if (roomId && uid && connected_with_uid) {
            this.uid = uid;
            this.roomId = roomId;
            this.toMe = roomId + '.me.' + uid;

            this.socket.join([this.roomId, this.toMe]);
            const result = await get_user_info(this.uid);
            if (result.detail == 'success') {
                this.user = result.data;
            }


            // this.connected_with_uid = connected_with_uid;
            // console.log('room set to ', roomId);
            // this.hasRemoved = await hasRemove(uid, connected_with_uid);
        }
    }

    async on_sendMessage(data) {
        if (!this.roomId)
            return;
        console.log('[emit "send_message"] ', data);
        // this.socket.join(this.roomId);
        if (this.roomId) {
            // this.saveMessageAndNotify(data);
            const response = await saveMessage(data);
            if (response.detail == 'success') {
                // broadcast this message
                this.io.to(this.roomId).emit('receiveMessage', { ...data, 'status': 'success', 'user': this.user });
            } else {

                this.io.to(this.toMe).emit('lastSentMessage', { ...data, 'status': 'error', 'user': this.user });
            }
            // send this message to me

        }
    }

    async saveMessageAndNotify(data) {
        // save the message on DB
        this.addedMessage(data);

        // const sockets = await this.socket.in(this.roomId).allSockets();

        // if (sockets.size == 1) {
        // TODO: if connected with user remove(block) this user then  
        // notification should not be send to connected with user.
        // if (this.connected_with_uid in uidActiveMapper && this.hasRemoved==false) {

        // this.socket.to(uidActiveMapper[this.connected_with_uid])
        //     .emit('notification', {
        //         type: 'notify',
        //         reloadRequired: false,
        //         content: `'${data?.displayName}' send a message`,
        //     });

        // }
        // }
    }

    on_sendNotification(data) {

        const { to, content } = data;
        if (to && content) {
            if (to in uidActiveMapper) {
                this.socket.to(uidActiveMapper[to])
                    .emit('notification', data)
            }
        }
    }

    on_setActiveUser(data) {
        // console.log('[AfterNet.setActiveIsCalled]',data);
        const { uid } = data;
        if (!!uid) {
            this.uid = uid;
            socketIdToUid[this.socket.id] = uid;
            uidActiveMapper[uid] = this.socket.id;
        }
    }

    on_getUserStatus({ uid }) {

        // console.log('[AfterNet.on_getUserStatus] ',uid);
        this.socket.join(this.uid);
        this.io.to(this.uid).emit('receiveUserState', uid && uid in uidActiveMapper);
        // this.socket.leave(this.uid);
    }

    on_disconnect(data) {
        // console.log('[AfterNet.Disconnect] ',data);
        if (this.socket.id in socketIdToUid) {
            try {
                const uid = socketIdToUid[this.socket.id];
                delete uidActiveMapper[uid];
                delete socketIdToUid[this.socket.id];
            } catch (e) {
                console.log('[AfterNet.Disconnect.Error] ', e);
            }
        }

    }

    markEventFunctions() {
        Object.getOwnPropertyNames(this.__proto__)
            .forEach(method_name => {
                if (method_name.startsWith('on_')) {
                    const func = this.__proto__[method_name];
                    this.socket.on(
                        method_name.slice(3), // on_abc -> abc
                        (params) => func.call(this, params)
                    )
                }
            })

    }

    addedMessage(data) {
        saveMessage(data);
    }
}

module.exports = {
    /**
     * 
     * @param {Namespace} io 
     * @param {Socket} socket 
     * @returns 
     */
    afterNetSocket: (io, socket) => {
        return new AfterNetSocket(io, socket)
    }
}