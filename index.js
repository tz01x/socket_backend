require("dotenv").config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { afterNetSocket } = require("./afterNet/afterNet");
const { chatConnect } = require('./chat');

const expressApp = express();
const server = http.createServer(expressApp);
expressApp.use(express.static(__dirname + '/public'));

const io = new Server(server, {
  cors: {
    origin: '*',
  },
})

expressApp.get('/', (req, res, next) => {
	res.sendFile(__dirname + '/index.html');
});

server.listen(process.env.PORT);
console.log('[Server Start at]',process.env.PORT)

const chatsIO = io.of('/chat');
chatsIO.on('connection',(socket)=> chatConnect(chatsIO,socket));

const afterNetIO = io.of('/afterNet');
afterNetIO.on('connection',(socket)=> afterNetSocket(afterNetIO,socket));

