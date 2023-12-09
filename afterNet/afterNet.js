const { Socket, Namespace } = require("socket.io");
const fetch = require('node-fetch');
const jwt = require('jsonwebtoken');



const BACKEND_API = process.env.API_ENDPOINT + '/api/afternet'

const BACKEND_API_DEFAULT_HEADER = {
    'Content-Type': 'application/json',
}

async function saveMessage(data) {
    try {
        console.log('backend api url is ', BACKEND_API);
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

async function get_user_info(uid, token) {
    try {
        const response = await fetch(BACKEND_API + '/get-user/' + uid, {
            method: 'GET',
            headers: {
            ...BACKEND_API_DEFAULT_HEADER,
            'Authorization': `Bearer `+token
            }
        });
        if(response.ok){
            return { detail: 'success', 'data': await response.json() }
        }
        return {detail: 'error', 'data': (await response.json())['detail']}
    } catch (error) {
        return { detail: 'error', 'data': error }
    }
}

function verifyAccessToken(token, uid) {
    try {
        console.log(`verifying token with token=${token} uid=${uid} se=${process.env.SECRET_KEY}`)
        const payload = jwt.verify(token, process.env.SECRET_KEY, { algorithms: ['HS256']});
        console.log('jwt payload are',payload)
        if (payload?.type == process.env.TOKEN_TYPE) {
            const user_info = jwt.verify(payload.user_identifier, process.env.PREFIX + process.env.SECRET_KEY);
            console.log('isValid will get :', user_info.uid == uid , ` for token.uid ${user_info.uid} and uid ${uid}`)
            return user_info.uid == uid
        }
    } catch (e) {
        console.log('error at verifying access code ', e)
        return false;
    }

    return false;
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

function isValid(request) {
    const { origin,uid, token } = request.headers;
    if(uid && verifyAccessToken(token, uid)){
        return true;
    }
    return false;

}

async function getChatRoomMembers(roomID,uid,token){
    try {
        const response = await fetch(`${BACKEND_API}/get-chat-room-members/${roomID}/${uid}`, {
            method: 'GET',
            headers: {
                ...BACKEND_API_DEFAULT_HEADER,
                'Authorization': `Bearer `+token
            }
        });
        if(response.ok){
            const jData = await response.json();
            return [false, jData];
        }
        return [true, await response.text()]
    } catch (error) {
        return [true, error];
    }
}


const uidToApplicationSocketId = new Map();
const uidToCurrentActiveRoomSocketId = new Map();

const socketIdToApplicationUid = new Map();
const socketToCurrentActiveRoomUid = new Map();

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
        this.token = null;
        this.connected_with_uid = null;
        this.hasRemoved = true;
        this.roomMembers = null;
        console.log('[AfterNet.newInstanceCreated] ', socket.id,this.uid);
        this.markEventFunctions();
    }

    async on_setRoom(data) {
        const { roomId, uid, connected_with_uid } = data;
        console.log('setting ... room ')
        if (roomId && uid && connected_with_uid) {
            this.socket
            this.uid = uid;
            this.roomId = roomId;
            this.toMe = roomId + '.me.' + uid;
            this.token = this.socket.request.headers.token;
            this.socket.join([this.roomId, this.toMe]);
            console.log(`config room : socket id ${this.socket.id} for user ${uid}`);
            const result = await get_user_info(this.uid, this.socket.request.headers.token);
            
            if (result.detail == 'success') {
                this.user = result.data;
                uidToCurrentActiveRoomSocketId.set(uid,this.socket.id);
                socketToCurrentActiveRoomUid.set(this.socket.id, uid);
            }
            const [hasError, res]  = await getChatRoomMembers(this.roomId,this.uid,this.token);
            if(!hasError){

                this.roomMembers = res;
                this.others_uids = this.roomMembers['others'].map(member=>{
                    return member?.user?.uid
                });
            }

            // this.connected_with_uid = s;
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
                // todo: SEND NOTIFICATIONS to all other member how is not in this message room.
           
                let sockets = await this.socket.in(this.roomId).allSockets();
                sockets = Array.from(sockets);
                const currentRoomActiveSocketIDs = new Map(
                    sockets.map(v=>[v,''])
                ); 

                const currentActiveUidToSocketID = new Map(sockets.filter(sid=>socketToCurrentActiveRoomUid.has(sid)).map((sid)=>{
                    return [socketToCurrentActiveRoomUid.get(sid),sid];
                }));
                
                this.others_uids.forEach(uid=>{
                    // user who is not in the this room
                    
                    if(!currentActiveUidToSocketID.has(uid)){
                        if(uidToApplicationSocketId.has(uid)){
                            this.socket.to(uidToApplicationSocketId.get(uid))
                            .emit('notification', {
                                type: 'new-message',
                                reloadRequired: false,
                                content: {roomId:this.roomId},
                            });
                        }
                    }
 
                })
                

            } else {

                this.io.to(this.toMe).emit('lastSentMessage', { ...data, 'status': 'error', 'user': this.user });
            }
            // send this message to me

        }
    }

    async saveMessageAndNotify(data) {
        // save the message on DB
        this.addedMessage(data);
        // get all the socket ids for this room.

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

    // on_sendNotification(data) {

    //     const { to, content } = data;
    //     if (to && content) {
    //         if (to in uiToSocketId) {
    //             this.socket.to(uiToSocketId[to].app)
    //                 .emit('notification', data)
    //         }
    //     }
    // }

    on_setActiveUser(data) {
        // console.log('[AfterNet.setActiveIsCalled]',data);
        const { uid } = data;
        if (!!uid) {
            console.log(`application socket id ${this.socket.id} for user ${uid}`);
            // socketIdToUid[this.socket.id] = {"app":uid};
            // uiToSocketId[uid] = {"app":this.socket.id};
            uidToApplicationSocketId.set(uid,this.socket.id);
            socketIdToApplicationUid.set(this.socket.id,uid);
        }
    }

    on_getUserStatus({ uid }) {

        // console.log('[AfterNet.on_getUserStatus] ',uid);
        // this.socket.join(this.uid);
        // this.io.to(this.uid).emit('receiveUserState', uid && uid in uiToSocketId);
        // this.socket.leave(this.uid);
    }

    on_disconnect(data) {
        console.log('[AfterNet.Disconnect] ',this.socket.id, this.uid);
        
        if(uidToCurrentActiveRoomSocketId.has(this.uid) && uidToCurrentActiveRoomSocketId.get(this.uid) === this.socket.id){
            uidToCurrentActiveRoomSocketId.delete(this.uid);
            socketToCurrentActiveRoomUid.delete(this.socket.id);

        }else if(uidToApplicationSocketId.has(this.uid) && uidToApplicationSocketId.get(this.uid) === this.socket.id){
            uidToApplicationSocketId.delete(this.uid);
            socketIdToApplicationUid.delete(this.socket.id);
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
        io.use((socket, next) => {
            const val = isValid(socket.request);
            console.log('actual value of isValid ', val);
            if (val) {
                next();
            } else {
                console.log('UnVerified user');
                next(new Error('invalid'))
            }
        });
        return new AfterNetSocket(io, socket)
    }
}