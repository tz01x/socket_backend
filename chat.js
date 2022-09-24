const ROOMS = {
    default:"room1",
}

function send_message(socket,data){

    console.log('[chat.SendMessage] ',socket.id);
    socket
        .broadcast
        .to(ROOMS.default)
        .emit('receive_message',{...data,time:Date.now()});
}

function disconnect(socket,data){
    console.log('[chat.Disconnect] ',data);
}

function addEvent(socket,func){
    socket.on(func.name,(params)=>func(socket,params))
}

function chatConnect(socket){
    socket.join(ROOMS.default)
    addEvent(socket,send_message);
    addEvent(socket,disconnect);

}

module.exports = { chatConnect };