'use strict';

var isChannelReady = false;
var isInitiator = false;
var isStarted = false;
var localStream;
var pc;
var remoteStream;
var turnReady;
var dataWebSocket;
var remoteVideo;

var pcConfig = {
    'iceServers': [{
        'urls': 'stun:stun.l.google.com:19302'
    }]
};

window.onload = init;
window.onbeforeunload = uninit;

function init() {
    webSocketInit();

    remoteVideo = document.querySelector('#screen');

    if (location.hostname !== 'localhost') {
        requestTurn(
            'https://computeengineondemand.appspot.com/turn?username=41784574&key=4080218913'
        );
    }
}

function uninit() {
    dataWebSocket.send('{type:bye}');
}

function webSocketInit() {
    dataWebSocket = new WebSocket('ws://' + window.location.host);
    dataWebSocket.onopen = onWsOpen;
    dataWebSocket.onclose = onWsClose;
    dataWebSocket.onerror = onWsError;
    dataWebSocket.onmessage = onWsMessage;
}

function onWsOpen(event) {
    console.log("WebSocket opened");

    dataWebSocket.send('{type:join}');
    isChannelReady = true;

    mouseInit(dataWebSocket);
}

function onWsClose(event) {
    console.log('WebSocket closed');
}

function onWsError(error) {
    console.log("WebSocket error: " + error.message);
}

function onWsMessage(event) {
    console.log('Received message:', event);
    var message = JSON.parse(event.data);

    if (message.type === 'sdp')
        handleSdpMessage(message);
    else if (message.type === 'ice')
        handleIceMessage(message);
    else if (message.type === 'bye' && isStarted)
        handleRemoteHangup();
}

function handleSdpMessage(message) {
    if (message.sdp.type === 'offer') {
        if (!isInitiator && !isStarted) {
            maybeStart();
        }
        pc.setRemoteDescription(new RTCSessionDescription(message.sdp));
        doAnswer();
    } else if (message.sdp.type === 'answer' && isStarted) {
        pc.setRemoteDescription(new RTCSessionDescription(message.sdp));
    }
}

function handleIceMessage(message) {
    if (message.ice.type === 'candidate' && isStarted) {
        var candidate = new RTCIceCandidate({
            sdpMLineIndex: message.ice.label,
            candidate: message.ice.candidate
        });
        pc.addIceCandidate(candidate);
    }
}

function sendMessage(message) {
    console.log('Client sending message: ', message);
    dataWebSocket.send('{type=sdp,sdp=' + JSON.stringify(message) + '}');
}

function sendIceMessage(message) {
    console.log('Client sending message: ', message);
    dataWebSocket.send('{type=ice,ice=' + JSON.stringify(message) + '}');
}

function maybeStart() {
    console.log('>>>>>>> maybeStart() ', isStarted, localStream, isChannelReady);
    if (!isStarted /*&& typeof localStream !== 'undefined'*/ && isChannelReady) {
        console.log('>>>>>> creating peer connection');
        createPeerConnection();
        isStarted = true;
        console.log('isInitiator', isInitiator);
        if (isInitiator) {
            doCall();
        }
    }
}

function createPeerConnection() {
    try {
        pc = new RTCPeerConnection(null);
        pc.onicecandidate = handleIceCandidate;
        pc.onaddstream = handleRemoteStreamAdded;
        pc.onremovestream = handleRemoteStreamRemoved;
        console.log('Created RTCPeerConnnection');
    } catch (e) {
        console.log('Failed to create PeerConnection, exception: ' + e.message);
        alert('Cannot create RTCPeerConnection object.');
        return;
    }
}

function handleIceCandidate(event) {
    console.log('icecandidate event: ', event);
    if (event.candidate) {
        sendIceMessage({
            type: 'candidate',
            label: event.candidate.sdpMLineIndex,
            id: event.candidate.sdpMid,
            candidate: event.candidate.candidate
        });
    } else {
        console.log('End of candidates.');
    }
}

function handleCreateOfferError(event) {
    console.log('createOffer() error: ', event);
}

function doCall() {
    console.log('Sending offer to peer');
    pc.createOffer(setLocalAndSendMessage, handleCreateOfferError);
}

function doAnswer() {
    console.log('Sending answer to peer.');
    pc.createAnswer().then(
        setLocalAndSendMessage,
        onCreateSessionDescriptionError
    );
}

function setLocalAndSendMessage(sessionDescription) {
    pc.setLocalDescription(sessionDescription);
    console.log('setLocalAndSendMessage sending message', sessionDescription);
    sendMessage(sessionDescription);
}

function onCreateSessionDescriptionError(error) {
    trace('Failed to create session description: ' + error.toString());
}

function requestTurn(turnURL) {
    var turnExists = false;
    for (var i in pcConfig.iceServers) {
        if (pcConfig.iceServers[i].urls.substr(0, 5) === 'turn:') {
            turnExists = true;
            turnReady = true;
            break;
        }
    }
    if (!turnExists) {
        console.log('Getting TURN server from ', turnURL);
        // No TURN server. Get one from computeengineondemand.appspot.com:
        var xhr = new XMLHttpRequest();
        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4 && xhr.status === 200) {
                var turnServer = JSON.parse(xhr.responseText);
                console.log('Got TURN server: ', turnServer);
                pcConfig.iceServers.push({
                    'urls': 'turn:' + turnServer.username + '@' + turnServer.turn,
                    'credential': turnServer.password
                });
                turnReady = true;
            }
        };
        xhr.open('GET', turnURL, true);
        xhr.send();
    }
}

function handleRemoteStreamAdded(event) {
    console.log('Remote stream added.');
    remoteStream = event.stream;
    remoteVideo.srcObject = remoteStream;
}

function handleRemoteStreamRemoved(event) {
    console.log('Remote stream removed. Event: ', event);
}

function hangup() {
    console.log('Hanging up.');
    stop();
    //XXX sendMessage('bye');
}

function handleRemoteHangup() {
    console.log('Session terminated.');
    stop();
    isInitiator = false;
}

function stop() {
    isStarted = false;
    pc.close();
    pc = null;
}