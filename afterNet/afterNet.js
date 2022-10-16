const { Socket, Namespace } = require("socket.io");
const fetch = require('node-fetch');
const { throws } = require("assert");


async function saveMessage(data) {
    try {

        const response = await fetch(`https://tumzied.pythonanywhere.com/afternet/add-message`, {
            method: 'POST',
            body: JSON.stringify(data),
            headers: {
                'Content-Type': 'application/json'
            }
        });
        const jsonData = await response.json();
        console.log(jsonData)
    } catch (error) {
        console.log('[error]', error)
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
        this.connected_with_uid = null;
        console.log('[AfterNet.newInstanceCreated] ', socket.id);
        this.markEventFunctions();

    }

    on_setRoom(data) {
        const { roomId, uid, connected_with_uid } = data;
        if (roomId && uid && connected_with_uid) {
            this.socket.join(roomId);
            this.roomId = roomId;
            this.uid = uid;
            this.connected_with_uid = connected_with_uid;
            console.log('room set to ', roomId);
        }
    }

    async on_sendMessage(data) {
        if (!this.roomId)
            return;
        console.log('[emit "send_message"] ', data);
        // this.socket.join(this.roomId);
        if (this.roomId) {
            this.io.to(this.roomId).emit('receiveMessage', data);
            this.addedMessage(data);
            const sockets = await this.socket.in(this.roomId).allSockets();
            if (sockets.size == 1) {
                if (this.connected_with_uid in uidActiveMapper) {
                    this.socket.to(uidActiveMapper[this.connected_with_uid])
                        .emit('notification', {
                            type: 'notify',
                            reloadRequired: false,
                            content: `'${data?.displayName}' send a message`,
                        })
                }
            }
        }
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