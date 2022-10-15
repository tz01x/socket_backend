const { Socket, Namespace } = require("socket.io");
const fetch = require('node-fetch');


async function  saveMessage(data) {
    try {

        const response = await fetch('https://tumzied.pythonanywhere.com/afternet/add-message', {
            method: 'POST',
            body: JSON.stringify(data),
            headers: {
                'Content-Type': 'application/json'
            }
        });
        const jsonData = await response.json();
        console.log(jsonData)
    } catch (error) {
        console.log('[error]',error)
    }

}

class AfterNetSocket{
    /**
     * 
     * @param {Namespace} io 
     * @param {Socket} socket 
     * @returns 
     */
    constructor(io,socket){
        this.io = io;
        this.socket = socket;
        this.roomId = ''
        console.log('[AfterNet.newInstanceCreated] ',socket.id);
        this.markEventFunctions();
        
    }

    on_setRoom(data){
        const {roomId} = data;
        if (roomId){    
            this.socket.join(roomId);
            this.roomId = roomId;
            console.log('room set to ',roomId);
            // const sockets =await this.socket.in(roomId).allSockets();
            // console.log(this.socket.id,sockets.size)
            // this.socket.emit('receiveMessage',{"from":'Alex',"message":"Hello Tumzied"});
        }
    }

    on_sendMessage(data){
        if(!this.roomId)
            return;
        console.log('[emit "send_message"] ',data);
        // this.socket.join(this.roomId);
        if(this.roomId){
            this.io.to(this.roomId).emit('receiveMessage',data);
            this.addedMessage(data);
        }
    }

    on_disconnect(data){
        console.log('[AfterNet.Disconnect] ',data);
    }

    markEventFunctions(){
        Object.getOwnPropertyNames(this.__proto__)
        .forEach(method_name=>{
            if(method_name.startsWith('on_')){
                const func = this.__proto__[method_name];
                this.socket.on(
                    method_name.slice(3), // on_abc -> abc
                    (params)=>func.call(this,params)
                )
            }
        })
        
    }

    addedMessage(data){
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
    afterNetSocket:(io,socket)=>{
        return new AfterNetSocket(io,socket)
    }
}