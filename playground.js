var socket;
let faceApi;
let detections = [];
let currentColor; // For your brush
let targetColor; // Target color for your brush
let partnerColor; // For partner's brush
let partnerTargetColor; // Target color for partner's brush
let brushSize = 10;
let other = {
  dominantEmotion: 'neutral',
};
let lastSentTime = 0;
let throttleInterval = 20; // Send data every 30ms
let topicText = "Welcome! The topic will appear here."; // Default topic
let countdownTime = 0; // Countdown timer
let showCountdown = false; // Flag to display the countdown

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
        socket.emit('ice-candidate', event.candidate);
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
  socket.emit('offer', peerConnection.localDescription);
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
  drawings = createGraphics(windowWidth, windowHeight);
  background(0); // Black background

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

  // Connect to the socket server
  socket = io.connect('https://shmoodle.glitch.me/');
  
socket.on('newTopic', (data) => {
  topicText = data.topic; // Update the topic
  showCountdown = false; // Hide the countdown
});

socket.on('startCountdown', (data) => {
  countdownTime = data.countdown; // Start the countdown
  showCountdown = true;

  // Decrement the countdown every second
  const countdownInterval = setInterval(() => {
    countdownTime--;
    if (countdownTime <= 0) {
      clearInterval(countdownInterval); // Stop the countdown
      showCountdown = false; // Hide countdown after completion
    }
  }, 1000);
});


  // Display the topic banner
  noCanvasInteraction = false; // Prevent canvas interaction when clicking UI elements
  
   initializeWebRTC(); // Initialize WebRTC audio

  // Add a button to start the call
  const callButton = createButton('Start Call');
  callButton.position(10, windowHeight - 150);
  callButton.mousePressed(startCall);

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



  // Listen for partner's emotion updates and strokes
  socket.on('mouse', (data) => {
    if (data.case === 1) {
      other.dominantEmotion = data.dominantEmotion; // Update partner's emotion
      partnerTargetColor = getEmotionColor(other.dominantEmotion); // Update partner's target color
    } else if (data.case === 3) {
      // Smoothly blend partner's colors
      partnerColor = lerpColor(partnerColor, partnerTargetColor, 0.05);
      drawings.stroke(partnerColor);
      drawings.strokeWeight(brushSize);
      drawings.line(data.oldX, data.oldY, data.x, data.y);
    } else if (data.case === 2) {
      // Clear the canvas when partner clears it
      drawings.clear();
      background(0); // Reset to black
    }
  });
  
  socket.on('newTopic', (data) => {
  topicText = data.topic; // Update the topic
  showCountdown = false; // Hide the countdown
});

socket.on('startCountdown', (data) => {
  countdownTime = data.countdown; // Start the countdown
  showCountdown = true;

  // Decrement the countdown every second
  const countdownInterval = setInterval(() => {
    countdownTime--;
    if (countdownTime <= 0) {
      clearInterval(countdownInterval); // Stop the countdown
      showCountdown = false; // Hide countdown after completion
    }
  }, 1000);
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
  currentColor = color(255); // Start with white brush
  targetColor = color(255); // Initialize target color
  partnerColor = color(255); // Start with white for partner
  partnerTargetColor = color(255); // Initialize partner's target color
}

function drawBanner() {
  // Draw the banner background
  fill(50, 50, 50, 200); // Semi-transparent black background
  noStroke();
  rect(0, 0, width, 50); // Banner size

  // Display the topic text
  fill(255); // White text
  textAlign(LEFT, CENTER);
  textSize(18);
  text(topicText, 10, 25); // Left-aligned topic text

  // Draw the countdown circle (if active)
  if (showCountdown && countdownTime > 0) {
    fill(255); // White circle
    noStroke();
    ellipse(width - 35, 25, 40, 40); // Circle on the right side of the banner

    // Display the countdown number
    fill(0); // Black text
    textAlign(CENTER, CENTER);
    textSize(18);
    text(countdownTime, width - 35, 25); // Number inside the circle
  }
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

  // Analyze emotions and send dominant emotion to partner
  if (detections.length > 0) {
    let expressions = detections[0].expressions;

    // Find the dominant emotion
    let dominantEmotion = Object.keys(expressions).reduce((a, b) =>
      expressions[a] > expressions[b] ? a : b
    );

    // Emit the dominant emotion to the server
    socket.emit('mouse', {
      case: 1,
      dominantEmotion: dominantEmotion,
    });

    // Update the target color based on dominant emotion
    targetColor = getEmotionColor(dominantEmotion);
  }

  faceApi.detect(gotFaces); // Continue detection
}

function draw() {
  
    drawBanner(); // Draw the banner

  // Gradually blend your brush color to the target color
  currentColor = lerpColor(currentColor, targetColor, 0.05);

// Draw on the canvas only below the banner
  if (mouseIsPressed && !noCanvasInteraction && mouseY > 50) { // Prevent drawing in the top 50px
    drawings.stroke(currentColor); // Your strokes in the current blended color
    drawings.strokeWeight(brushSize);
    drawings.line(mouseX, mouseY, pmouseX, pmouseY);


    // Emit your drawing data to the server
    socket.emit('mouse', {
      case: 3,
      oldX: pmouseX,
      oldY: pmouseY,
      x: mouseX,
      y: mouseY,
    });
  }
  
  

  // Display the shared drawings
  image(drawings, 0, 0);
}

function keyPressed() {
  // Clear the canvas on LEFT_ARROW press
  if (keyCode === LEFT_ARROW) {
    drawings.clear();
    background(0); // Reset to black background

    // Notify the partner to clear their canvas
    socket.emit('mouse', {
      case: 2,
    });
  }
}

function getEmotionColor(dominantEmotion) {
  // Set colors for different emotions
  switch (dominantEmotion) {
    case 'happy':
      return color(255, 223, 0); // Yellow
    case 'sad':
      return color(0, 0, 255); // Blue
    case 'angry':
      return color(255, 0, 0); // Red
    case 'neutral':
      return color(200, 200, 200); // Light gray
    // case 'disgusted':
    //   return color(0, 128, 0); // Green
    // case 'surprised':
    //   return color(0, 255, 255); // Cyan
    // case 'fearful':
    //   return color(255, 165, 0); // Orange
    default:
      return color(0, 0, 0); // Default to black
  }
}

// Adjust canvas size on window resize
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  drawings = createGraphics(windowWidth, windowHeight);
  background(0); // Reset the background
}
