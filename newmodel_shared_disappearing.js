var socket;
let faceApi;
let detections = [];
let currentColor; // For your brush
let partnerColor; // For partner's brush
let brushSize = 70; // Thicker brush
let shapes = []; // Store ephemeral strokes
let partnerShapes = []; // Store partner's ephemeral strokes
let partnerConnected = false; // Track if partner is connected
let roomID; // Unique room ID for each session
let other = {
  dominantEmotion: 'neutral',
};

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
  // Create a full-screen canvas
  createCanvas(windowWidth, windowHeight);
  background(0); // Start with a black canvas

  // Initialize video capture
  videoInput = createCapture(VIDEO);
  videoInput.size(width / 4, height / 4); // Smaller video feed
  videoInput.hide();

  // Initialize ml5 face-api with options
  const faceOptions = {
    withLandmarks: true,
    withExpressions: true,
    withDescriptors: false,
    minConfidence: 0.5,
  };
  faceApi = ml5.faceApi(videoInput, faceOptions, faceReady);


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
  const script = new URLSearchParams(window.location.search).get('script') || 'newmodel_shared_disappearing.js';
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


  // Listen for partner's ephemeral strokes
  socket.on('mouse', (data) => {
    if (data.case === 1) {
      // Update partner's brush color
      partnerColor = color(data.color[0], data.color[1], data.color[2], data.color[3]);
    } else if (data.case === 3) {
      // Add partner's ephemeral stroke
      partnerShapes.push(data.stroke);
    } else if (data.case === 2) {
      // Clear the canvas
      shapes = [];
      partnerShapes = [];
      background(0);
    }
  });

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

  
  // Default brush colors
  currentColor = color(255, 255, 255, 255); // Solid white for your brush
  partnerColor = color(200, 200, 200, 255); // Default gray for partner
}

function faceReady() {
  faceApi.detect(gotFaces);
}

function gotFaces(error, result) {
  if (error) {
    console.error(error);
    return;
  }

  detections = result;

  // Analyze emotions and update brush color
  updateBrushColor();

  faceApi.detect(gotFaces); // Continue detection
}

function draw() {
  // Create a faint black overlay for ephemeral effect
  fill(0, 0, 0, 50); // Slightly transparent black overlay
  noStroke();
  rect(0, 0, width, height);

  // Render local and partner ephemeral strokes
  renderEphemeralStrokes(shapes);
  renderEphemeralStrokes(partnerShapes);

  // Create new strokes when drawing
  if (mouseIsPressed) {
    let newShape = {
      x: mouseX,
      y: mouseY,
      px: pmouseX,
      py: pmouseY,
      color: [red(currentColor), green(currentColor), blue(currentColor), 255],
      size: brushSize, // Thicker brush
      opacity: 255,
    };
    shapes.push(newShape);

    // Emit the new stroke to the server
    socket.emit('mouse', {
      case: 3,
      stroke: newShape,
    });
  }
}

function renderEphemeralStrokes(strokes) {
  for (let i = strokes.length - 1; i >= 0; i--) {
    let shape = strokes[i];
    stroke(color(...shape.color)); // Convert color array back to `color`
    strokeWeight(shape.size);
    line(shape.x, shape.y, shape.px, shape.py);

    // Reduce opacity and size over time
    shape.opacity -= 3; // Slower fade-out (reduce opacity more gradually)
    shape.size -= 0.1; // Slower shrink (reduce size more gradually)
    shape.color[3] = shape.opacity; // Update alpha channel

    if (shape.opacity <= 0 || shape.size <= 0) {
      strokes.splice(i, 1); // Remove faded strokes
    }
  }
}

function updateBrushColor() {
  if (detections.length > 0) {
    let expressions = detections[0].expressions;

    // Calculate weighted average of colors based on emotions
    let targetColor = color(0, 0, 0, 255);
    let totalWeight = 0;

    const emotionColors = {
      happy: color(255, 223, 0, 255), // Yellow
      sad: color(0, 0, 255, 255), // Blue
      angry: color(255, 0, 0, 255), // Red
      neutral: color(200, 200, 200, 255), // Light gray
      disgusted: color(0, 128, 0, 255), // Green
      surprised: color(0, 255, 255, 255), // Cyan
      fearful: color(255, 165, 0, 255), // Orange
    };

    for (let emotion in emotionColors) {
      if (expressions[emotion]) {
        let weight = expressions[emotion];
        targetColor = lerpColor(targetColor, emotionColors[emotion], weight);
        totalWeight += weight;
      }
    }

    if (totalWeight > 0) {
      currentColor = lerpColor(currentColor, targetColor, 0.1); // Smooth blending
    }

    // Emit the current color to the partner
    socket.emit('mouse', {
      case: 1,
      color: currentColor.levels,
    });
  }
}

function keyPressed() {
  // Clear the canvas on LEFT_ARROW press
  if (keyCode === LEFT_ARROW) {
    shapes = [];
    partnerShapes = [];
    background(0);

    // Notify the partner to clear their canvas
    socket.emit('mouse', {
      case: 2,
    });
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  background(0); // Reset to black background
}
