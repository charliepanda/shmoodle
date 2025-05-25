var socket;
let faceApi;
let detections = [];

let brushInfoLabel, brushInfoHighlight;


// ── New color variables ──
// “self” means this machine’s (your) own facial expression
// “partner” means the partner’s facial expression (received via socket)
let selfBrushColor, selfBrushTargetColor;       // Will be used for remote strokes (i.e. the strokes coming from your partner)
// (Your own facial expression will color the strokes that your partner sees.)
let partnerBrushColor, partnerBrushTargetColor; // Will be used for your local drawing strokes (i.e. the brush you draw with)
// (Your local brush is controlled by your partner’s facial expression.)

let brushSize = 10;
let other = {
  dominantEmotion: 'neutral',
};
let lastSentTime = 0;
let throttleInterval = 20; // Send data every 20ms

let partnerConnected = false; // Track if partner is connected

const canvasWidth = 1440; // Fixed width
const canvasHeight = 821; // Fixed height
let roomID; // Unique room ID for each session

// Graphics for drawing
let drawings;

// Video capture
let videoInput;

// WebRTC variables
let localStream;
let remoteStream;
let peerConnection;
let isMuted = false; // Mute state

let muteButton, clearButton, toast, inviteToast, startCallBtnInToast;


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
  // Extract roomID from URL or create a new one
  const params = new URLSearchParams(window.location.search);
  roomID = params.get('room') || Math.random().toString(36).substring(2, 10);
  if (!params.get('room')) {
    // Update the URL with the generated roomID
    window.history.replaceState(null, null, `?room=${roomID}`);
  }

  // Connect to the socket server
  socket = io.connect('https://shmoodle.glitch.me/');
  socket.emit('joinRoom', { roomID });

  // Create a full-screen canvas
  let canvas = createCanvas(canvasWidth, canvasHeight);
  drawings = createGraphics(canvasWidth, canvasHeight);
  background(0); // Black background

  // Center the canvas
  const xPos = (windowWidth - canvasWidth) / 2;
  const yPos = (windowHeight - canvasHeight) / 2;
  canvas.position(xPos, yPos); // Position the canvas at the center

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

  initializeWebRTC(); // Initialize WebRTC audio

  // // Add a button to start the call
  // const callButton = createButton('Start Call');
  // callButton.position(10, 10);
  // callButton.mousePressed(startCall);

  // Add a button to toggle mute/unmute
  muteButton = createButton('<i class="fa-solid fa-microphone-slash"></i>');
  muteButton.position(20, windowHeight - 80);
  muteButton.style('width', '60px');
  muteButton.style('height', '60px');
  muteButton.style('font-size', '24px');
  muteButton.style('background', 'rgba(58,58,58)');
  muteButton.style('color', 'white');
  muteButton.style('border', 'none');
  muteButton.style('border-radius', '50%');
  muteButton.style('display', 'flex');
  muteButton.style('align-items', 'center');
  muteButton.style('justify-content', 'center');
  muteButton.style('cursor', 'pointer');
  muteButton.mousePressed(toggleMute);
  muteButton.hide();
  
  // ── Initialize our brush color variables ──
  // These start as white.
  selfBrushColor = color(255);
  selfBrushTargetColor = color(255);
  partnerBrushColor = color(255);
  partnerBrushTargetColor = color(255);
  
brushInfoLabel = createDiv();
brushInfoLabel.style('position', 'absolute');
brushInfoLabel.style('top', '16px');
brushInfoLabel.style('left', '16px');
brushInfoLabel.style('padding', '8px 14px');
brushInfoLabel.style('border-radius', '8px');
brushInfoLabel.style('font-family', 'Karla, sans-serif');
brushInfoLabel.style('font-size', '18px');
brushInfoLabel.style('font-weight', '600');
//brushInfoLabel.style('background', 'rgba(58, 58, 58, 0.95)');
brushInfoLabel.style('color', 'white');
brushInfoLabel.style('z-index', '30');
brushInfoLabel.style('display', 'inline-flex');
brushInfoLabel.style('gap', '4px');


// Static part
let staticSpan = createSpan("you’re coloring with");
staticSpan.parent(brushInfoLabel);

// Dynamic color span
brushInfoHighlight = createSpan(" your partner’s emotions");
brushInfoHighlight.parent(brushInfoLabel);

  
  // Invite Toast
  inviteToast = createDiv("You're all alone right now, send the invite link to your friend and Shmoodle together.");
  inviteToast.id('invite-toast');
  inviteToast.style('position', 'absolute');
  inviteToast.style('top', '20px');
  inviteToast.style('left', '50%');
  inviteToast.style('transform', 'translateX(-50%)');
  inviteToast.style('background', 'rgba(58, 58, 58, 0.95)');
  inviteToast.style('color', 'white');
  inviteToast.style('padding', '16px 24px');
  inviteToast.style('border-radius', '8px');
  inviteToast.style('font-size', '16px');
  inviteToast.style('box-shadow', '0 4px 10px rgba(0,0,0,0.3)');
  inviteToast.style('z-index', '20');
  inviteToast.style('display', 'none');

  const copyLinkButton = createButton('Copy Link');
  copyLinkButton.parent(inviteToast);
  copyLinkButton.style('margin-left', '12px');
  copyLinkButton.style('padding', '6px 16px');
  copyLinkButton.style('background', 'white');
  copyLinkButton.style('color', 'black');
  copyLinkButton.style('border', 'none');
  copyLinkButton.style('border-radius', '4px');
  copyLinkButton.style('cursor', 'pointer');
  copyLinkButton.mousePressed(() => {
    const script = new URLSearchParams(window.location.search).get('script') || 'myemo_yourbrush.js';
    const link = `${window.location.origin}${window.location.pathname}?script=${script}&room=${roomID}`;
    navigator.clipboard.writeText(link);
    copyLinkButton.html('Link Copied!');
  });

  // Toast (Partner Online)
  toast = createDiv();
  toast.id('partner-toast');
  toast.style('position', 'absolute');
  toast.style('top', '20px');
  toast.style('left', '50%');
  toast.style('transform', 'translateX(-50%)');
  toast.style('background', 'rgba(58, 58, 58, 0.95)');
  toast.style('color', 'white');
  toast.style('padding', '16px 24px');
  toast.style('border-radius', '8px');
  toast.style('font-family', "'Karla', sans-serif");
  toast.style('font-size', '16px');
  toast.style('font-weight', '500');
  toast.style('display', 'none');
  toast.style('z-index', '20');
  toast.style('display', 'flex');
  toast.style('align-items', 'center');
  toast.style('gap', '12px');
  toast.style('box-shadow', '0 4px 10px rgba(0,0,0,0.3)');

  const toastText = createDiv('Your partner is online.');
  toastText.parent(toast);
  toastText.style('font-weight', 'bold');
  toastText.style('display', 'inline-block');
  toastText.style('margin-right', '12px');
  toastText.style('padding', '0');

  startCallBtnInToast = createButton('Start Call');
  startCallBtnInToast.parent(toast);
  startCallBtnInToast.style('padding', '6px 16px');
  //startCallBtnInToast.style('margin-left', '12px');
  startCallBtnInToast.style('background', 'white');
  startCallBtnInToast.style('color', 'black');
  startCallBtnInToast.style('border', 'none');
  startCallBtnInToast.style('border-radius', '4px');
  startCallBtnInToast.style('cursor', 'pointer');
  startCallBtnInToast.mousePressed(() => {
    startCall();
    socket.emit('callStarted', { roomID });
    muteButton.show();
    toast.hide();
  });
  
    // callButton.mousePressed(startCall);

  
  socket.on('hideToast', () => {
  toast.hide();
});
  
socket.on('showMuteButton', () => {
  muteButton.show();
  topicButton.show(); // Show topic button after call starts

});

  clearButton = createButton('<i class="fa-solid fa-trash-can"></i>');
  clearButton.position(windowWidth - 80, windowHeight - 80);
  clearButton.style('width', '60px');
  clearButton.style('height', '60px');
  clearButton.style('font-size', '24px');
  clearButton.style('background', 'rgba(58,58,58)');
  clearButton.style('color', 'white');
  clearButton.style('border', 'none');
  clearButton.style('border-radius', '50%');
  clearButton.style('display', 'flex');
  clearButton.style('align-items', 'center');
  clearButton.style('justify-content', 'center');
  clearButton.style('cursor', 'pointer');
  clearButton.mousePressed(() => {
    drawings.clear();
    background(0);
    socket.emit('mouse', { case: 2 });
  });

  socket.on('roomStatus', (numUsers) => {
    if (numUsers > 1) {
      inviteToast.hide();
      toast.show();
    } else {
      inviteToast.show();
      toast.hide();
    }
  });


  // Listen for partner's emotion updates and strokes
  socket.on('mouse', (data) => {
    if (data.case === 1) {
      // This is a face update from our partner.
      other.dominantEmotion = data.dominantEmotion;
      // Update the brush that controls your own (local) drawing.
      // Your brush (what you draw with) will reflect your partner's facial expression.
      partnerBrushTargetColor = getEmotionColor(other.dominantEmotion);
    } else if (data.case === 3) {
      // These are drawing data from your partner.
      // They will be drawn using your "self" brush color,
      // which is determined by your own facial expression.
      const scaledOldX = data.oldX * canvasWidth;
      const scaledOldY = data.oldY * canvasHeight;
      const scaledX = data.x * canvasWidth;
      const scaledY = data.y * canvasHeight;
      selfBrushColor = lerpColor(selfBrushColor, selfBrushTargetColor, 0.05);
      drawings.stroke(selfBrushColor);
      drawings.strokeWeight(brushSize);
      drawings.line(scaledOldX, scaledOldY, scaledX, scaledY);
    } else if (data.case === 2) {
      // Clear the canvas when partner clears it.
      drawings.clear();
      background(0); // Reset to black
    }
  });

  // WebRTC signaling listeners
  socket.on('offer', async (data) => {
    if (data.roomID !== roomID) return; // Ignore if it's for another room
    console.log('Received offer:', data.offer);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    // Send the answer back to the server
    socket.emit('answer', { answer: peerConnection.localDescription, roomID });
  });

  socket.on('answer', async (data) => {
    if (data.roomID !== roomID) return; // Ignore if it's for another room
    console.log('Received answer:', data.answer);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
  });

  socket.on('ice-candidate', async (data) => {
    if (data.roomID !== roomID) return; // Ignore if it's for another room
    console.log('Received ICE candidate:', data.candidate);
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
    }
  });

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
    // Send your dominant emotion to your partner.
    // Your facial expression will determine the color of the strokes
    // that your partner sees (i.e. the remote brush color on their side).
    socket.emit('mouse', {
      case: 1,
      dominantEmotion: dominantEmotion,
    });
    // Update your own (self) brush target color.
    // (This will be used for drawing strokes coming from your partner on their screen.)
    selfBrushTargetColor = getEmotionColor(dominantEmotion);
  }

  faceApi.detect(gotFaces); // Continue detection
}

function draw() {
  // For your local drawing, use the brush color determined by your partner’s facial expression.
  partnerBrushColor = lerpColor(partnerBrushColor, partnerBrushTargetColor, 0.05);

  if (mouseIsPressed) {
    drawings.stroke(partnerBrushColor);
    drawings.strokeWeight(brushSize);
    drawings.line(mouseX, mouseY, pmouseX, pmouseY);

    // Emit your drawing data to the server.
    // Your partner will draw these strokes using your selfBrushColor
    // (which comes from your own facial expression).
    socket.emit('mouse', {
      case: 3,
      oldX: pmouseX / canvasWidth,
      oldY: pmouseY / canvasHeight,
      x: mouseX / canvasWidth,
      y: mouseY / canvasHeight,
    });
  }

  // Display the shared drawings
  image(drawings, 0, 0);
  
  let r = red(partnerBrushColor);
let g = green(partnerBrushColor);
let b = blue(partnerBrushColor);
brushInfoHighlight.style('color', `rgb(${r}, ${g}, ${b})`);

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
    // Additional emotions can be added as desired.
    default:
      return color(0, 0, 0); // Default to black
  }
}

// Adjust canvas size on window resize
function windowResized() {
  const xPos = (windowWidth - canvasWidth) / 2;
  const yPos = (windowHeight - canvasHeight) / 2;
  canvas.position(xPos, yPos); // Reposition the canvas to keep it centered
}
