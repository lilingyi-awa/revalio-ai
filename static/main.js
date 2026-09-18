// SPDX-License-Identifier: MIT
// Copyright (C) 2026-present ConSync, Ltd.

function display_popup(flag){
    let popups = {
        security: document.getElementById("security-popup-container"),
        pow: document.getElementById("pow-popup-container"),
    }
    for(i in popups){
        let dom = popups[i];
        if(flag == i){
            dom.style.display = "block";
        } else {
            dom.style.display = "none";
        }
    }
}

window.chatHistory = [];
window.chatLocker = false;

async function beginChatSession(question){
    if(window.chatLocker){return;}
    window.chatLocker = true;
    let button1 = document.getElementById("chat-send-button");
    let button2 = document.getElementById("chat-export-button");
    let button3 = document.getElementById("chat-import-button");
    let container = document.getElementById("chat-stream-content");
    button1.disabled = "disabled";
    button2.disabled = "disabled";
    button3.disabled = "disabled";
    let user_vedal = container.appendChild((()=>{
        let med = document.createElement("div");
        med.className = "chat-subject-message";
        med.innerHTML = '<p><img src="/static/icon/user.svg" alt="" style="vertical-align: middle; width: 1.3rem; aspect-ratio: 1; padding-left: 1px;" alt="" draggable="false"/><strong>用户</strong></p>';
        let ser = med.appendChild(document.createElement("div"));
        ser.innerHTML = marked.parse(question);
        ser.className = "message-retain-buffer";
        return med;
    })());
    let agent_vedal = document.createElement("div");
    window.agentResponse = "";
    window.agentSuccess = false;
    window.agentError = "connection.close";
    try{
        // PoW
        pow_message = container.appendChild(document.createElement("div"));
        pow_message.className = "chat-subject-event";
        pow_message.innerHTML = '<img src="/static/icon/lock.svg" alt="" style="vertical-align: middle; width: 1.3rem; aspect-ratio: 1; padding-left: 1px;" alt="" draggable="false"/>';
        pow_message.appendChild(document.createTextNode("正在执行PoW CAPTCHA..."));
        pow_message.onclick = ()=>{display_popup('pow')};
        try{
            pow_challgence = (await (await fetch("/api/get-pow-problem")).json()).problem;
            pow_response = await proofOfWork(pow_challgence);
        }finally{
            pow_message.remove();
        }
        // Chat
        agent_vedal.className = "chat-subject-message";
        agent_vedal.innerHTML = '<p><img src="/static/icon/model.svg" alt="" style="vertical-align: middle; width: 1.3rem; aspect-ratio: 1; padding-left: 1px;" alt="" draggable="false"/><strong>Revelio</strong></p>';
        let retain_buffer = agent_vedal.appendChild(document.createElement("div"));
        retain_buffer.className = "message-retain-buffer";
        container.appendChild(agent_vedal);
        await postSSE("/api/prediction", {
            history: window.chatHistory,
            question: question,
            pow: {
                challgence: pow_challgence,
                response: pow_response,
            }
        }, {
            onEvent(event){
                let data = JSON.parse(event.data);
                console.log(data);
                if(data.type == "error"){window.agentError = data.error;}
                if(data.type == "delta"){
                    window.agentResponse += data.content;
                    retain_buffer.innerHTML = marked.parse(window.agentResponse);
                }
                if(data.type == "done"){
                    window.chatHistory.push({
                        user: question,
                        agent: window.agentResponse,
                        sign: data.signature,
                    });
                    window.agentSuccess = true;
                }
            }
        });
    }finally{
        button1.removeAttribute("disabled");
        button2.removeAttribute("disabled");
        button3.removeAttribute("disabled");
        window.chatLocker = false;
        if(!window.agentSuccess){
            switch(window.agentError){
                case "connection.close": alert("错误：连接意外关闭！"); break;
                case "server.error": alert("错误：系统后端错误！"); break;
                case "sign.invalid": alert("错误：历史消息签名错误！"); break;
                case "pow.invalid": alert("错误：Proof-of-Work失败！"); break;
                case "filter.rejected": alert("错误：检测到违禁词！"); break;
                default: alert("错误：未识别的错误！"); break;
            }
            user_vedal.remove();
            agent_vedal.remove();
        }
    }
}

async function deliver_message(){
    if(window.chatLocker){return;}
    let ta = document.getElementById("chat-input");
    if(ta.value != ""){
        let backup = ta.value;
        ta.value = "";
        await beginChatSession(backup);
        if(!window.agentSuccess && window.agentError != "filter.rejected"){
            ta.value = backup;
        }
    }
}

function export_history(){
    if(window.chatLocker){return;}
    if(window.chatHistory.length == 0){return;}
    const jsonStr = JSON.stringify({"type": "revelio.history", "history": window.chatHistory});
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "revelio-history.json";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

async function import_history(){
    if(window.chatLocker){return;}
    if(window.chatHistory.length != 0){
        alert("该窗口已有历史消息，请开启一个新窗口再操作！");
        return;
    }
    let container = document.getElementById("chat-stream-content");
    window.chatLocker = true;
    try{
        try{
            const [handle] = await window.showOpenFilePicker();
        }catch(e){
            return;
        }
        const file = await handle.getFile();
        const pocket = JSON.parse(await file.text());
        if(pocket.type != "revelio.history"){alert("无效的历史文件！"); return;}
        window.chatHistory = pocket.history;
        for(i of window.chatHistory){
            container.appendChild((()=>{
                let med = document.createElement("div");
                med.className = "chat-subject-message";
                med.innerHTML = '<p><img src="/static/icon/user.svg" alt="" style="vertical-align: middle; width: 1.3rem; aspect-ratio: 1; padding-left: 1px;" alt="" draggable="false"/><strong>用户</strong></p>';
                let ser = med.appendChild(document.createElement("div"));
                ser.innerHTML = marked.parse(i.user);
                ser.className = "message-retain-buffer";
                return med;
            })());
            container.appendChild((()=>{
                let med = document.createElement("div");
                med.className = "chat-subject-message";
                med.innerHTML = '<p><img src="/static/icon/model.svg" alt="" style="vertical-align: middle; width: 1.3rem; aspect-ratio: 1; padding-left: 1px;" alt="" draggable="false"/><strong>Revelio</strong></p>';
                let ser = med.appendChild(document.createElement("div"));
                ser.innerHTML = marked.parse(i.agent);
                ser.className = "message-retain-buffer";
                return med;
            })());
        }
    }catch(e){
        console.error(e);
        alert("无效的历史文件！");
        window.chatHistory = [];
        container.innerHTML = "";
        window.chatLocker = false;
    }finally{
        window.chatLocker = false;
    }
}

async function proofOfWork(challgence){
    while(true){
        const salt = crypto.getRandomValues(new Uint8Array(32));
        const key = await hashwasm.scrypt({
            password: challgence,
            salt,
            costFactor: 256,
            blockSize: 8,
            parallelism: 4,
            hashLength: 2,
            outputType: 'hex'
        });
        if(key.startsWith("00") && key[2] < '4'){
            return salt.toHex();
        }
        await scheduler.yield();
    }
}