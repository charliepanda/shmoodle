var socket;
let userCount = 1; // Assume alone until told otherwise
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
let inviteToast; // declare but don't assign

let callStartedYet = false; // New variable
let inviteTooltip; // Tooltip that explains to unmute

let connectPopup;
let connectButton;
let isInitiator = false; // only user 1 gets the Connect button


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

let topicToast;

//let welcomeToast;
let welcomeTimer;

let brushInfoLabel, brushInfoHighlight;



let welcomeSteps = [
  "Welcome, friend.",
  "What you see here is a drawing canvas where your facial expressions change your brush color as you draw.",
  "Go ahead and try drawing while smiling 😁",
  "There you go… how about inviting a friend?",
];
let welcomeStepIndex = 0;
let welcomeOverlay;
let nextButton;
let hasDrawn = false;
let welcomeActive = true;



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
    track.enabled = !isMuted;
  });

  // Update styles
  if (isMuted) {
    muteButton.style('background', 'rgba(255, 255, 255, 1)');
    muteButton.style('color', 'black');
  } else {
    muteButton.style('background', 'rgba(58,58,58)');
    muteButton.style('color', 'white');

//     if (inviteTooltip) {
//       inviteTooltip.remove(); // 🧼 remove tooltip after unmuting
//     }
  }

 // muteButton.removeClass('glow-button'); // stop glowing after toggle
}


function setup() {
  

  // Extract roomID from URL or create a new one
  const params = new URLSearchParams(window.location.search);
  roomID = params.get('room') || Math.random().toString(36).substring(2, 10);
  if (!params.get('room')) {
    // Update the URL with the generated roomID
    window.history.replaceState(null, null, `?room=${roomID}`);
  }
  
const isUser1 = !params.get('room'); // true if this user generated the room (i.e., first one)
  

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
  // //callButton.hide(); // ← ADD THIS to hide it on load

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
brushInfoHighlight = createSpan(" your emotions.");
brushInfoHighlight.parent(brushInfoLabel);


// Mute toggle in bottom-left
muteButton = createButton('<i class="fa-solid fa-microphone-slash"></i>');
muteButton.style('width', '60px');
muteButton.style('height', '60px');
muteButton.style('font-size', '24px');
muteButton.style('background', 'rgba(58,58,58)');
muteButton.style('color', 'white');
muteButton.style('border', 'none');
muteButton.style('border-radius', '50%');
muteButton.style('cursor', 'pointer');
muteButton.mousePressed(toggleMute);
muteButton.position(20, windowHeight - 80);
muteButton.hide();  // show it only once a partner joins


  // Listen for partner's emotion updates and strokes
  socket.on('mouse', (data) => {
    if (data.case === 1) {
      other.dominantEmotion = data.dominantEmotion; // Update partner's emotion
      partnerTargetColor = getEmotionColor(other.dominantEmotion); // Update partner's target color
    } else if (data.case === 3) {
      // Smoothly blend partner's colors
      const scaledOldX = data.oldX * canvasWidth;
      const scaledOldY = data.oldY * canvasHeight;
      const scaledX = data.x * canvasWidth;
      const scaledY = data.y * canvasHeight;
      partnerColor = lerpColor(partnerColor, partnerTargetColor, 0.05);

      drawings.stroke(partnerColor);
      drawings.strokeWeight(brushSize);
      drawings.line(scaledOldX, scaledOldY, scaledX, scaledY);
    } else if (data.case === 2) {
      // Clear the canvas when partner clears it
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
  
  socket.on('clearCanvasNow', () => {
  drawings.clear();
  background(0);
});


  // Default brush colors
  currentColor = color(255); // Start with white brush
  targetColor = color(255); // Initialize target color
  partnerColor = color(255); // Start with white for partner
  partnerTargetColor = color(255); // Initialize partner's target color



  
  // Create toast container
if (!inviteToast) {
  inviteToast = createDiv();
}
inviteToast.id('invite-toast');

// Toast styles
  inviteToast.style('display', 'none');
//inviteToast.style('display', 'flex');
inviteToast.style('align-items', 'center');
inviteToast.style('gap', '12px');
inviteToast.style('white-space', 'nowrap');
inviteToast.style('max-width', '90vw');
inviteToast.style('overflow', 'hidden');
inviteToast.style('background', 'rgba(58, 58, 58, 0.95)');
inviteToast.style('padding', '16px 24px');
inviteToast.style('border-radius', '8px');
inviteToast.style('box-shadow', '0 4px 10px rgba(0,0,0,0.3)');
inviteToast.style('color', 'white');
inviteToast.style('font-family', 'Karla, sans-serif');
inviteToast.style('font-size', '16px');
inviteToast.style('font-weight', '500');
inviteToast.style('position', 'absolute');
inviteToast.style('top', '20px');
inviteToast.style('left', '50%');
inviteToast.style('transform', 'translateX(-50%)');
inviteToast.style('z-index', '20');

// Add text inside (IMPORTANT: createSpan)
const inviteText = createSpan("There you go… how about inviting a friend?");
inviteText.parent(inviteToast);
inviteText.style('margin', '0');
inviteText.style('flex-shrink', '0');
inviteText.style('flex-grow', '1');
inviteText.style('overflow', 'hidden');            // ✨ Important
inviteText.style('text-overflow', 'ellipsis');      // ✨ Important

inviteText.style('white-space', 'nowrap');
inviteText.style('min-width', '0');

  

// Button
const copyLinkButton = createButton('Invite a friend');
copyLinkButton.parent(inviteToast);
copyLinkButton.addClass('toast-button');
copyLinkButton.elt.addEventListener('click', (e) => {
  e.stopPropagation();
  const script = new URLSearchParams(window.location.search).get('script') || 'newmodel_shared.js';
  const link = `${window.location.origin}${window.location.pathname}?script=${script}&room=${roomID}`;
  navigator.clipboard.writeText(link);
  copyLinkButton.html('Invite Link Copied!');
  copyLinkButton.attribute('disabled', true);
setTimeout(() => {
  welcomeOverlay.remove();
}, 3000); // 3000ms = 3 seconds
});

// Toast background
inviteToast.elt.addEventListener('click', (e) => {
  e.stopPropagation();
});




  
// Clear button in bottom-right
clearButton = createButton('<i class="fa-duotone fa-solid fa-eraser"></i>');
clearButton.style('width', '60px');
clearButton.style('height', '60px');
clearButton.style('font-size', '32px');
clearButton.style('background', 'rgba(58,58,58)');
clearButton.style('color', 'white');
clearButton.style('border', 'none');
clearButton.style('border-radius', '50%');
clearButton.style('cursor', 'pointer');
clearButton.mousePressed(() => {
  drawings.clear();
  background(0);
  socket.emit('mouse', { case: 2 });
});
clearButton.position(windowWidth - 80, windowHeight - 80);

clearButton.mousePressed(() => {
  drawings.clear();
  background(0); // Reset to black background
  socket.emit('mouse', { case: 2 }); // Notify partner
});
  
const topicButton = createButton('<i class="fa-solid fa-question"></i>');
//topicButton.position(windowWidth - 80, windowHeight - 160); // Always relative to clearButton
topicButton.style('width', '60px');
topicButton.style('height', '60px');
topicButton.style('font-size', '24px');
topicButton.style('background', 'rgba(58,58,58)');
topicButton.style('color', 'white');
topicButton.style('border', 'none');
topicButton.style('border-radius', '50%');
topicButton.style('display', 'flex');
topicButton.style('align-items', 'center');
topicButton.style('justify-content', 'center');
topicButton.style('cursor', 'pointer');
topicButton.hide(); // Hide initially


socket.on('newTopic', (data) => {
  showTopicToast(data.topic);
});
  
// Show the topic toast
function showTopicToast(topicText) {
  const topicToast = createDiv(topicText);
  topicToast.id('topic-toast');
  topicToast.style('position', 'absolute');
  topicToast.style('top', '20px');
  topicToast.style('left', '50%');
  topicToast.style('transform', 'translateX(-50%)');
  topicToast.style('background', 'rgba(58, 58, 58, 0.95)');
  topicToast.style('color', 'white');
  topicToast.style('padding', '16px 24px');
  topicToast.style('border-radius', '8px');
  topicToast.style('font-family', "'Karla', sans-serif");
  topicToast.style('font-size', '20px');
  topicToast.style('font-weight', '500');
  topicToast.style('z-index', '100');
  topicToast.style('box-shadow', '0 4px 10px rgba(0,0,0,0.3)');
  topicToast.style('transition', 'opacity 1s ease'); // fade-out effect

  // Automatically fade out after 8 seconds
  setTimeout(() => {
    topicToast.style('opacity', '0');
    setTimeout(() => {
      topicToast.remove();
    }, 1000); // Remove after fade
  }, 8000);
}
  
function showConnectPopup() {
  connectPopup = createDiv();
  connectPopup.id('connect-popup');
  connectPopup.style('position', 'absolute');
  connectPopup.style('top', '50%');
  connectPopup.style('left', '50%');
  connectPopup.style('transform', 'translate(-50%, -50%)');
  connectPopup.style('background', 'rgba(58, 58, 58, 0.95)');
  connectPopup.style('padding', '32px 40px');
  connectPopup.style('border-radius', '12px');
  connectPopup.style('box-shadow', '0 4px 20px rgba(0,0,0,0.35)');
  connectPopup.style('color', 'white');
  connectPopup.style('font-family', 'Karla, sans-serif');
  connectPopup.style('font-size', '16px');
  connectPopup.style('text-align', 'center');
  connectPopup.style('z-index', '100');
  connectPopup.style('line-height', '1.4');
  connectPopup.style('max-width', '360px');

  if (userCount === 2) {
    if (isUser1) {
      connectPopup.html(`
        <div style="font-size: 20px; font-weight: 600; margin-bottom: 12px;">Your friend just joined!</div>
        <div style="margin-bottom: 20px;">Tap Connect to start drawing and chatting together.</div>
      `);

      connectButton = createButton('Connect');
      connectButton.parent(connectPopup);
      connectButton.style('padding', '8px 20px');
      connectButton.style('font-size', '16px');
      connectButton.style('font-family', 'Karla, sans-serif');
      connectButton.style('background', 'white');
      connectButton.style('color', 'black');
      connectButton.style('border', 'none');
      connectButton.style('border-radius', '6px');
      connectButton.style('cursor', 'pointer');

      connectButton.mousePressed(() => {
        socket.emit('clearCanvasForBoth', { roomID });
        connectPopup.remove();
        startCall();
        muteButton.show();
        socket.emit('startCallFromInitiator', { roomID });

        
      });
    } else {
      connectPopup.html(`
        <div style="font-size: 20px; font-weight: 600; margin-bottom: 12px;">Waiting for your friend…</div>
        <div>Your friend will start the session shortly.</div>
      `);
    }
  }
}

  
  
  topicButton.mousePressed(() => {
  socket.emit('requestNewTopic'); // Only emits once per session
});
  
  
  
// Create tooltip
const topicTooltip = createDiv("Need something to talk about?");
topicTooltip.style('position', 'absolute');
topicTooltip.style('background', 'rgba(58, 58, 58, 0.9)');
topicTooltip.style('color', 'white');
topicTooltip.style('padding', '6px 10px');
topicTooltip.style('border-radius', '6px');
topicTooltip.style('font-family', 'Karla, sans-serif');
topicTooltip.style('font-size', '14px');
topicTooltip.style('box-shadow', '0 4px 8px rgba(0,0,0,0.3)');
topicTooltip.style('display', 'none');
topicTooltip.style('z-index', '20');

// Show/hide tooltip on hover
topicButton.mouseOver(() => {
  topicTooltip.style('display', 'block');
  const x = topicButton.position().x - 140;
  const y = topicButton.position().y - 35;
  topicTooltip.position(x, y);
});

topicButton.mouseOut(() => {
  topicTooltip.style('display', 'none');
});
  
  
// Partner Connected TOAST with inline layout
const toast = createDiv();
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
toast.style('font-weight', '500');toast.style('display', 'none');
toast.style('z-index', '20');
//toast.style('display', 'flex');              // ← side-by-side layout
toast.style('align-items', 'center');       // ← vertically align text/button
toast.style('gap', '12px');                 // ← space between text & button
toast.style('box-shadow', '0 4px 10px rgba(0,0,0,0.3)');

// Add the text inside the toast
const toastText = createDiv('Your friend is here! 🎉');
toastText.parent(toast);
toastText.style('font-weight', 'bold');
toastText.style('display', 'inline-block'); // ← ensures it's next to the button
toastText.style('margin-right', '12px');       // ← remove default spacing
toastText.style('padding', '16');



socket.on('roomStatus', (numUsers) => {
        userCount = numUsers; // ← Update here

  if (numUsers > 1) {
    inviteToast.style('display', 'none');
    showConnectPopup(); // once 2nd user joins, show popup for both
    muteButton.show();
//        friendStatus.show(); // ✅ Show friend indicator
//        topicButton.show(); // ✅ Add this line to show topic button


  } else {
    
    
     // showWelcomeToast(); // ✅ only call for user #1
    muteButton.hide();
        friendStatus.hide(); // ✅ Show friend indicator
    topicButton.hide(); // ✅ Add this line to show topic button

    if (inviteTooltip) inviteTooltip.hide();
    
    if (welcomeOverlay && !welcomeOverlay.removed) return;

    inviteToast.style('display', 'flex');
  }
});

socket.on('startCallNow', () => {
  if (connectPopup) connectPopup.remove();

});
  


// Remove position() calls from each button!
// === 🧁 Multi-Step Welcome Flow ===
if (userCount === 1 && isUser1) {
welcomeOverlay = createDiv(welcomeSteps[welcomeStepIndex]);
welcomeOverlay.id('multi-welcome-toast');
welcomeOverlay.style('position', 'absolute');
welcomeOverlay.style('top', '20px');
welcomeOverlay.style('left', '50%');
welcomeOverlay.style('transform', 'translateX(-50%)');
welcomeOverlay.style('background', 'rgba(58, 58, 58, 0.95)');
welcomeOverlay.style('color', 'white');
welcomeOverlay.style('padding', '16px 24px');
welcomeOverlay.style('border-radius', '8px');
welcomeOverlay.style('font-family', "'Karla', sans-serif");
welcomeOverlay.style('font-size', '16px');
welcomeOverlay.style('font-weight', '500');
welcomeOverlay.style('z-index', '100');
welcomeOverlay.style('text-align', 'center');
welcomeOverlay.style('box-shadow', '0 4px 10px rgba(0,0,0,0.3)');
welcomeOverlay.style('line-height', '1.4');

// Button for "Next"
nextButton = createButton('Next');
nextButton.parent(welcomeOverlay);
nextButton.style('margin-top', '12px');
nextButton.addClass('toast-button');

nextButton.mousePressed(() => {
  welcomeStepIndex++;

  if (welcomeStepIndex === 2) {
    // "Go ahead and try drawing" step: show toast, wait 6 seconds
    welcomeOverlay.html(welcomeSteps[welcomeStepIndex]);
    welcomeOverlay.child(nextButton);
    nextButton.hide(); // Hide the CTA during this step

    // Delay to auto-advance
    setTimeout(() => {
      welcomeStepIndex++;
      welcomeOverlay.html(welcomeSteps[welcomeStepIndex]);
      welcomeOverlay.child(copyLinkButton);
      copyLinkButton.html("Invite a friend");
      copyLinkButton.show(); // Show button again
    }, 6000);
    
  } else if (welcomeStepIndex === 3) {
    // Final: remove toast and allow drawing
    welcomeOverlay.remove();
    welcomeActive = false;
    inviteToast.style('display', 'flex');
  } else {
    welcomeOverlay.html(welcomeSteps[welcomeStepIndex]);
    welcomeOverlay.child(nextButton);
  }
});

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
  // Gradually blend your brush color to the target color
  currentColor = lerpColor(currentColor, targetColor, 0.05);

if (mouseIsPressed) {
  drawings.stroke(currentColor);
  drawings.strokeWeight(brushSize);
  drawings.line(mouseX, mouseY, pmouseX, pmouseY);

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
  // Auto-advance when user draws on step 2

  
let r = red(currentColor);
let g = green(currentColor);
let b = blue(currentColor);
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
  const xPos = (windowWidth - canvasWidth) / 2;
  const yPos = (windowHeight - canvasHeight) / 2;
  canvas.position(xPos, yPos); // Reposition the canvas to keep it centered

  // Reposition main buttons
  muteButton.position(20, windowHeight - 80);
  clearButton.position(windowWidth - 80, windowHeight - 80);
  
  // Position topic button relative to clear button
  const clearBtnX = windowWidth - 80;
  const clearBtnY = windowHeight - 80;
  topicButton.position(clearBtnX, clearBtnY - 80); // 80px above the clear button

  // Move the tooltip correctly if it's visible
  if (topicTooltip.style('display') !== 'none') {
    const topicBtnPos = topicButton.position();
    topicTooltip.position(topicBtnPos.x - 140, topicBtnPos.y - 35);
  }
  
}


