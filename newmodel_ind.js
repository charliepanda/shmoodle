let faceApi;
let detections = [];

var socket;
let currentColor;
let brushSize = 10;
let other = {
  dominantEmotion: 'neutral'
};
let partnerConnected = false; // Track if partner is connected
let roomID; // Unique room ID for each session

let lastSentTime = 0;
let throttleInterval = 20; // Send data every 30ms

// Graphics for drawing
let drawings;

// Video capture
let videoInput;

// WebRTC variables
let localStream;
let remoteStream;
let peerConnection;
let isMuted = false; // Mute state


// STUN server configuration
const rtcConfig = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

// Initialize WebRTC and request microphone access
async function initializeWebRTC() {
  try {
    // Get local audio stream
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

    // Create a new WebRTC peer connection
    peerConnection = new RTCPeerConnection(rtcConfig);

    // Add local audio stream tracks to the peer connection
    localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));

    // Set up remote audio stream
    remoteStream = new MediaStream();
    peerConnection.ontrack = (event) => {
      remoteStream.addTrack(event.track);
      // Play the remote stream through an audio element
      const remoteAudio = new Audio();
      remoteAudio.srcObject = remoteStream;
      remoteAudio.play();
    };

    // Handle ICE candidates and send them to the server
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('ice-candidate', { candidate: event.candidate, roomID });
      }
    };

    console.log('WebRTC initialized');
  } catch (error) {
    console.error('Error initializing WebRTC:', error);
  }
}

// Start the WebRTC call
async function startCall() {
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  // Send the offer to the server
  socket.emit('offer', { offer: peerConnection.localDescription, roomID });
  console.log('Offer sent to the server');
}

// Toggle mute/unmute
function toggleMute() {
  isMuted = !isMuted;
  localStream.getAudioTracks().forEach((track) => {
    track.enabled = !isMuted; // Enable or disable the audio track
  });

  // Update button styles and icon based on mute state
  if (isMuted) {
    muteButton.style('background', 'rgba(255, 255, 255, 1)'); // Solid white background
    muteButton.style('color', 'black'); // Black icon
  } else {
    muteButton.style('background', 'rgba(58,58,58)'); // Transparent white background
    muteButton.style('color', 'white'); // White icon
  }
}


function setup() {
  
  // Create a canvas that adjusts to the window size
  createCanvas(windowWidth, windowHeight);
  drawings = createGraphics(windowWidth, windowHeight);
  background(0); // Black background for the canvas

  // Initialize video capture
  let video = createCapture(VIDEO);
  video.size(width / 4, height / 4); // Smaller video feed
  video.hide();

  // Initialize face-api with options
  const faceOptions = {
    withLandmarks: true,
    withExpressions: true,
    withDescriptors: false,
    minConfidence: 0.5
  };
  faceApi = ml5.faceApi(video, faceOptions, faceReady);

  const params = new URLSearchParams(window.location.search);
  roomID = params.get('room') || Math.random().toString(36).substring(2, 10);
  if (!params.get('room')) {
    window.history.replaceState(null, null, `?room=${roomID}`);
  }

  socket = io.connect('https://shmoodle.glitch.me/');
  socket.emit('joinRoom', { roomID });
  
   initializeWebRTC(); // Initialize WebRTC audio

  // Add a button to start the call
  const callButton = createButton('Start Call');
  callButton.position(10, 10);
  callButton.mousePressed(startCall);

// Create the "Invite Partner" button
const inviteButton = createButton('Invite Partner');
inviteButton.addClass('invite-button'); // Apply the CSS class
inviteButton.position(windowWidth - 160, windowHeight - 60); // Place on the bottom right

// Add the partner connection text (hidden by default)
const partnerConnectedText = createDiv('Partner Connected!');
partnerConnectedText.style('color', 'white');
partnerConnectedText.style('font-size', '16px');
partnerConnectedText.style('font-weight', 'bold');
partnerConnectedText.style('display', 'none'); // Initially hidden
partnerConnectedText.position(windowWidth - 160, windowHeight - 60); // Same position as the button

// Listen for room status updates
socket.on('roomStatus', (numUsers) => {
  if (numUsers > 1) {
    inviteButton.hide(); // Hide the invite button
    partnerConnectedText.style('display', 'block'); // Show the "Partner Connected!" text
  } else {
    partnerConnectedText.style('display', 'none'); // Hide the "Partner Connected!" text
    inviteButton.show(); // Show the invite button
  }
});

// Handle invite partner button click
inviteButton.mousePressed(() => {
  // Copy the link to clipboard
  const script = new URLSearchParams(window.location.search).get('script') || 'newmodel_ind.js';
  const roomID = new URLSearchParams(window.location.search).get('room') || 'defaultRoom';
 // Update the URL with script and roomID
  const link = `${window.location.origin}${window.location.pathname}?script=${script}&room=${roomID}`;
  navigator.clipboard.writeText(link);
  // Change the button text to "Link Copied"
  inviteButton.html('Link Copied');

  // Create a temporary text bubble
  const bubble = createDiv('Share the link with your partner to Shmoodle together.');
  bubble.style('position', 'absolute');
  bubble.style('top', `${windowHeight - 120}px`); // Position above the button
  bubble.style('left', `${windowWidth - 200}px`); // Align horizontally with the button
  bubble.style('background', 'rgba(58,58,58,1)');
  bubble.style('color', 'white');
  bubble.style('padding', '10px');
  bubble.style('border-radius', '5px');
  bubble.style('font-size', '14px');
  bubble.style('box-shadow', '0 0 10px rgba(0,0,0,0.5)');

  // Remove the bubble and reset button text after 5 seconds
  setTimeout(() => {
    bubble.remove();
    inviteButton.html('Invite Partner');
  }, 8000);
});

  // Create the "Clear Canvas" button
  const clearButton = createButton('Clear My Shmoodle');
  clearButton.position(windowWidth - 160, windowHeight - 120); // Position at the bottom-left of the screen
  clearButton.style('background', 'rgba(58, 58, 58, 1)');
  clearButton.style('color', 'white');
  clearButton.style('padding', '10px 20px');
  clearButton.style('border', 'none');
  clearButton.style('border-radius', '5px');
  clearButton.style('font-size', '16px');
  clearButton.style('cursor', 'pointer');
  clearButton.style('box-shadow', '0 0 10px rgba(255, 255, 255, 0.2)');

  clearButton.mousePressed(() => {
    // Clear the canvas
    drawings.clear();
    background(0); // Reset to black background

    // // Notify the partner to clear their canvas
    // socket.emit('mouse', {
    //   case: 2,
    // });
  }); 
  
// Add a button to toggle mute/unmute
muteButton = createButton('<i class="fa-solid fa-microphone-slash"></i>'); // Font Awesome icon
muteButton.position(40, height - 100); // Bottom-left of the screen
muteButton.style('width', '60px');
muteButton.style('height', '60px');
muteButton.style('font-size', '24px'); // Font Awesome size
muteButton.style('background', 'rgba(58,58,58)'); // Initial transparent white background
muteButton.style('color', 'white'); // Initial white icon color
muteButton.style('border', 'none');
muteButton.style('border-radius', '50%'); // Circular button
muteButton.style('display', 'flex');
muteButton.style('align-items', 'center');
muteButton.style('justify-content', 'center');
muteButton.style('cursor', 'pointer');
muteButton.mousePressed(toggleMute);
muteButton.mouseOver(() => (noCanvasInteraction = true)); // Prevent drawing when hovering over the button
muteButton.mouseOut(() => (noCanvasInteraction = false)); // Re-enable drawing


  // Listen for partner's emotion updates
  socket.on('mouse', (data) => {
    if (data.case === 1) {
      other.dominantEmotion = data.dominantEmotion;
    }
    else if (data.case === 2) {
      // Clear the canvas when partner clears it
      drawings.clear();
      background(0); // Reset to black
    }
  });

  // Default brush color
  currentColor = color(0, 0, 0);
}

  // WebRTC signaling listeners
  socket.on('offer', async (offer) => {
    console.log('Received offer:', offer);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    // Send the answer back to the server
    socket.emit('answer', peerConnection.localDescription);
  });

  socket.on('answer', async (answer) => {
    console.log('Received answer:', answer);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  });

  socket.on('ice-candidate', async (candidate) => {
    console.log('Received ICE candidate:', candidate);
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
    }
  });


function faceReady() {
  faceApi.detect(gotFaces);
}

function gotFaces(error, result) {
  if (error) {
    console.error(error);
    return;
  }

  detections = result;

  // Analyze emotions and send dominant emotion to partner
  if (detections.length > 0) {
    let expressions = detections[0].expressions;

    // Find the dominant emotion
    let dominantEmotion = Object.keys(expressions).reduce((a, b) => expressions[a] > expressions[b] ? a : b);

    // Emit the dominant emotion to the server
    socket.emit('mouse', {
      case: 1,
      dominantEmotion: dominantEmotion
    });
  }

  faceApi.detect(gotFaces); // Continue detection
}

function draw() {
  // Update brush color based on partner's dominant emotion
  updateBrushColor(other.dominantEmotion);

  // Draw if the mouse is pressed
  if (mouseIsPressed) {
    drawings.stroke(currentColor);
    drawings.strokeWeight(brushSize);
    drawings.line(mouseX, mouseY, pmouseX, pmouseY);

    // Display the drawings
    image(drawings, 0, 0);
  }
}

// function keyPressed() {
//   // Clear the canvas on LEFT_ARROW press
//   if (keyCode === LEFT_ARROW) {
//     drawings.clear();
//     background(0); // Reset to black background
    
//   }
// }

function updateBrushColor(dominantEmotion) {
  // Set colors for different emotions
  switch (dominantEmotion) {
    case 'happy':
      currentColor = lerpColor(currentColor, color(255, 223, 0), 0.05); // Yellow
      break;
    case 'sad':
      currentColor = lerpColor(currentColor, color(0, 0, 255), 0.05); // Blue
      break;
    case 'angry':
      currentColor = lerpColor(currentColor, color(255, 0, 0), 0.05); // Red
      break;
    case 'neutral':
      currentColor = lerpColor(currentColor, color(200, 200, 200), 0.05); // Light gray
      break;
    case 'disgusted':
      currentColor = lerpColor(currentColor, color(0, 128, 0), 0.05); // Green
      break;
    case 'surprised':
      currentColor = lerpColor(currentColor, color(0, 255, 255), 0.05); // Cyan
      break;
    case 'fearful':
      currentColor = lerpColor(currentColor, color(255, 165, 0), 0.05); // Orange
      break;
    default:
      currentColor = lerpColor(currentColor, color(0, 0, 0), 0.05); // Default to black
  }
}

// Adjust canvas size on window resize
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  drawings = createGraphics(windowWidth, windowHeight);
  background(0); // Keep the background black on resize
}
