const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { chatConnect } = require('./chat');

const expressApp = express();
const server = http.createServer(expressApp);
// expressApp.use(express.static(__dirname + '/public'));

const io = new Server(server, {
  cors: {
    origin: ['http://localhost:8000','http://localhost:5500'],
  }
})

// expressApp.get('/', (req, res, next) => {
// 	res.sendFile(__dirname + '/index.html');
// });

server.listen(process.env.PORT);


const chatsIO = io.of('/chat');
chatsIO.on('connection', chatConnect);
