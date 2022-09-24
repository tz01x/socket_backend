
const ROOMS = {
    default:"room1",
}
class ChatAgent{
    constructor(io,socket){
        this.io = io;
        this.socket = socket;
        this.socket.join(ROOMS.default);
        this.update_userscount();
        this.markEventFunctions();
        console.log('[USER CONNECTED] ',socket.id);
    }

    on_send_message(self, data){

        self.socket
            .to(ROOMS.default)
            .emit('receive_message',{...data,time:Date.now()});
    }
    
    on_disconnect(self, data){
        console.log('[chat.Disconnect] ',data);
        self.update_userscount();
    }
    
    markEventFunctions(){
        Object.getOwnPropertyNames(this.__proto__)
        .forEach(method_name=>{
            if(method_name.startsWith('on_')){
                const func = this.__proto__[method_name];
                this.socket.on(
                    method_name.slice(3), // on_abc -> abc
                    (params)=>func(this,params)
                )
            }
        })
        
    }

    async update_userscount(){
        const sockets =await this.socket.in(ROOMS.default).allSockets();

        console.log('[USER COUNT] ',sockets.size);

        this.io.emit('get_active_user_count',{
            count:sockets.size
        });
    }
    
}

function chatConnect(io,socket){
    const agent = new ChatAgent(io,socket);
}

module.exports = { chatConnect };