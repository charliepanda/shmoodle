var express = require('express');

var app = express();
var server = app.listen(process.env.PORT || 3000); // Use Glitch's dynamic port

app.use(express.static('public')); // Serve static files from 'public' directory

console.log("Socket server is running");

var socket = require('socket.io');

var io = socket(server);

const canvasWidth = 1440; // Standardized canvas width
const canvasHeight = 821; // Standardized canvas height

const rooms = {}; // Track rooms and their users

const topics = [
  "question1",
  "question2.",
  "question3",
  "question4",
  "question5",
];

let currentTopicIndex = 0;

function assignInitialTopic(roomID) {
  const randomIndex = Math.floor(Math.random() * topics.length);
  const selectedTopic = topics[randomIndex];
  rooms[roomID].topic = selectedTopic;
}

function newConnection(socket) {
  console.log('New connection: ' + socket.id);

  let roomID;

socket.on('joinRoom', (data) => {
  roomID = data.roomID;
  socket.join(roomID);
  console.log(`User ${socket.id} joined room: ${roomID}`);

  // ✅ Ensure room is initialized BEFORE anything else
  if (!rooms[roomID]) {
    rooms[roomID] = { users: [], topicRotation: null };
  }

  // ✅ Now it's safe to check this
  if (rooms[roomID].isFirstTime !== undefined) {
    socket.emit('versionExperienceConfirmed', rooms[roomID].isFirstTime);
  }

  // ✅ Now it's also safe to track users
  rooms[roomID].users.push(socket.id);

  const numUsers = rooms[roomID].users.length;
  io.to(roomID).emit('roomStatus', numUsers);

  if (numUsers === 1) {
    assignInitialTopic(roomID);
  }

  socket.emit('canvasDimensions', { width: canvasWidth, height: canvasHeight });
});

  
  socket.on('versionExperienceConfirmed', (value) => {
  isFirstTime = value;
  if (isFirstTime) {
    showVersionExplanation(version);
    setTimeout(() => {
      topicButton.show();
    }, 60000);
  } else {
    topicButton.show(); // Show it right away
  }
});

  socket.on('startCallFromInitiator', ({ roomID }) => {
  io.to(roomID).emit('startCallNow');
});

socket.on('clearCanvasForBoth', ({ roomID }) => {
  io.to(roomID).emit('clearCanvasNow');
});

  
  // Handle 'mouse' events (for drawing)
  socket.on('mouse', (data) => {
    socket.to(roomID).emit('mouse', data); // Send to all other clients in the same room
    console.log(`Mouse data received in room ${roomID}:`, data);
  });

  // Handle 'sendEmotion' events (for emotion data)
  socket.on('sendEmotion', (data) => {
    socket.to(roomID).emit('partnerEmotion', data); // Send emotion data to partner in the same room
    console.log(`Emotion data received in room ${roomID}:`, data);
  });

  // WebRTC signaling
  socket.on('offer', (offer) => {
    socket.to(roomID).emit('offer', offer);
  });

  socket.on('answer', (answer) => {
    socket.to(roomID).emit('answer', answer);
  });

  socket.on('ice-candidate', (candidate) => {
    socket.to(roomID).emit('ice-candidate', candidate);
  });

// Handle call started — hide toast on both users' screens
socket.on('callStarted', ({ roomID }) => {
  io.to(roomID).emit('hideToast');
    io.to(roomID).emit('showMuteButton'); // Notify both users to show the mute button

});  
  
  // Handle disconnections
  socket.on('disconnect', () => {
    console.log(`User ${socket.id} disconnected from room: ${roomID}`);
    if (roomID && rooms[roomID]) {
      // Remove the user from the room
      rooms[roomID].users = rooms[roomID].users.filter((id) => id !== socket.id);

      // Notify all clients in the room about the updated user count
      const numUsers = rooms[roomID].users.length;
      io.to(roomID).emit('roomStatus', numUsers);

      // Stop topic rotation if the room is empty
      if (numUsers === 0 && rooms[roomID].topicRotation) {
        clearInterval(rooms[roomID].topicRotation);
        delete rooms[roomID];
      }
    }
  });

  // Handle topic requests
  socket.on('requestNewTopic', () => {
    // currentTopicIndex = (currentTopicIndex + 1) % topics.length; // Cycle through topics
    // io.to(roomID).emit('newTopic', topics[currentTopicIndex]); // Broadcast to the room
    if (rooms[roomID] && rooms[roomID].topic) {
  socket.emit('newTopic', { topic: rooms[roomID].topic });
}
    console.log(`Broadcasting new topic in room ${roomID}: ${topics[currentTopicIndex]}`);
  });
}

io.sockets.on('connection', newConnection);

