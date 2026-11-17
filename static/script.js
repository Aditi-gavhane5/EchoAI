const $ = (s) => document.querySelector(s);
const csrf = $('meta[name="csrf-token"]').content;
const messages = $('#messages'), welcome = $('#welcome'), chatPanel = $('#chatPanel');
let conversationId = sessionStorage.getItem('echoai-conversation') || null;
let selectedFiles = [], busy = false, recognition = null, selectionGeneration = 0;

async function api(url, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('X-CSRF-Token', csrf);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
  return data;
}
function toast(message) { const el=$('#toast'); el.textContent=message; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),2800); }
function escapeHTML(value) { const div=document.createElement('div'); div.textContent=value || ''; return div.innerHTML; }
function formatText(value) {
  let safe=escapeHTML(value);
  safe=safe.replace(/```([\s\S]*?)```/g,'<pre><code>$1</code></pre>').replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>');
  return safe;
}
function addMessage(role, content, attachments=[]) {
  welcome.classList.add('hidden');
  const row=document.createElement('article'); row.className=`message ${role}`;
  if(role==='assistant'){const avatar=document.createElement('div');avatar.className='ai-avatar';avatar.textContent='✦';row.append(avatar);}
  const bubble=document.createElement('div');bubble.className='bubble';
  attachments.forEach(file=>{const chip=document.createElement('div');chip.className='attachment';chip.textContent='▤ '+file.name;bubble.append(chip);});
  const text=document.createElement('div');text.innerHTML=formatText(content);bubble.append(text);
  if(role==='assistant' && content){const controls=document.createElement('div');controls.className='message-controls';const speak=document.createElement('button');speak.className='text-btn';speak.textContent='▶ Read aloud';speak.onclick=()=>speakText(content);controls.append(speak);row.append(bubble,controls);} else row.append(bubble);
  messages.append(row); scrollBottom(); return row;
}
function addRetryMessage(message,files,requestConversationId,useSearch,errorText){
  const row=addMessage('assistant',`Sorry, I couldn't complete that request. ${errorText}`);
  row.classList.add('message-error');
  const controls=row.querySelector('.message-controls');
  const retry=document.createElement('button'); retry.className='text-btn retry-button'; retry.textContent='↻ Retry';
  retry.onclick=()=>{row.remove();sendMessage(null,{message,files,conversationId:requestConversationId,useSearch});};
  controls.append(retry);
}
function scrollBottom(){chatPanel.scrollTo({top:chatPanel.scrollHeight,behavior:'smooth'});}
async function loadConversations() {
  const {conversations}=await api('/api/conversations');
  const nav=$('#conversationList'); nav.replaceChildren();
  conversations.forEach(conv=>{
    const row=document.createElement('div');
    row.className='conversation-row'+(conv.conversation_id===conversationId?' active':'');
    row.dataset.id=conv.conversation_id;
    const open=document.createElement('button');
    open.className='conversation-open'; open.textContent=conv.title; open.title=conv.title;
    open.setAttribute('aria-current',conv.conversation_id===conversationId?'page':'false');
    open.onclick=()=>selectConversation(conv.conversation_id);
    const options=document.createElement('button');
    options.className='conversation-options'; options.type='button'; options.textContent='⋯';
    options.title=`Options for ${conv.title}`; options.setAttribute('aria-label',options.title);
    options.onclick=event=>{
      event.stopPropagation();
      nav.querySelectorAll('.conversation-menu').forEach(menu=>menu.remove());
      const menu=document.createElement('div'); menu.className='conversation-menu';
      const rename=document.createElement('button'); rename.type='button'; rename.textContent='Rename';
      rename.onclick=()=>startConversationRename(conv,row);
      const remove=document.createElement('button'); remove.type='button'; remove.textContent='Delete'; remove.className='danger-text';
      remove.onclick=()=>deleteConversation(conv);
      menu.append(rename,remove); row.append(menu);
    };
    row.append(open,options); nav.append(row);
  });
  return conversations;
}

function startConversationRename(conv,row){
  row.replaceChildren();
  const form=document.createElement('form'); form.className='conversation-rename';
  const input=document.createElement('input'); input.type='text'; input.value=conv.title; input.maxLength=100;
  input.setAttribute('aria-label','Conversation title');
  const save=document.createElement('button'); save.type='submit'; save.textContent='Save'; save.className='save-rename';
  const cancel=document.createElement('button'); cancel.type='button'; cancel.textContent='Cancel'; cancel.className='cancel-rename';
  cancel.onclick=()=>loadConversations().catch(err=>toast(err.message));
  form.append(input,save,cancel);
  form.onsubmit=async event=>{
    event.preventDefault();
    try{
      await api(`/api/conversations/${conv.conversation_id}`,{method:'PATCH',body:JSON.stringify({title:input.value})});
      const conversations=await loadConversations();
      const updated=conversations.find(item=>item.conversation_id===conv.conversation_id);
      if(updated&&conversationId===conv.conversation_id)$('#chatTitle').textContent=updated.title;
      toast('Conversation renamed');
    }catch(err){toast(err.message);input.focus();}
  };
  row.append(form); input.focus(); input.select();
}

async function deleteConversation(conv){
  if(!confirm(`Delete “${conv.title}” and its messages?`))return;
  try{
    await api(`/api/conversations/${conv.conversation_id}`,{method:'DELETE',headers:{'X-Confirmed':'yes'}});
    if(conversationId===conv.conversation_id){
      conversationId=null; sessionStorage.removeItem('echoai-conversation');
      messages.replaceChildren(); welcome.classList.remove('hidden'); $('#chatTitle').textContent='New chat';
    }
    await loadConversations();
  }catch(err){toast(err.message);}
}

async function selectConversation(id) {
  const generation=++selectionGeneration;
  try{
    const data=await api(`/api/conversations/${id}`);
    if(generation!==selectionGeneration)return;
    conversationId=id; sessionStorage.setItem('echoai-conversation',id);
    messages.replaceChildren();
    data.messages.forEach(m=>addMessage(m.role,m.content,m.attachments||[]));
    const conversations=await loadConversations();
    const selected=conversations.find(item=>item.conversation_id===id);
    $('#chatTitle').textContent=selected?.title||'Conversation';
    $('#sidebar').classList.remove('open');
  }
  catch(err){toast(err.message);}
}
async function newChat(){selectionGeneration++;try{const data=await api('/api/conversations',{method:'POST',body:'{}'});conversationId=data.conversation_id;sessionStorage.setItem('echoai-conversation',conversationId);messages.replaceChildren();welcome.classList.remove('hidden');$('#chatTitle').textContent='New chat';await loadConversations();$('#messageInput').focus();}catch(err){toast(err.message)}}
$('#newChat').onclick=newChat;

async function sendMessage(event,retryData=null){
  event?.preventDefault(); if(busy)return;
  const input=$('#messageInput');
  const message=retryData?.message??input.value.trim();
  const pendingFiles=retryData?.files??selectedFiles.slice();
  const requestConversationId=retryData?retryData.conversationId:conversationId;
  const useSearch=retryData?retryData.useSearch:$('#searchToggle').checked;
  if(!message&&!pendingFiles.length)return;
  busy=true; $('#sendBtn').disabled=true;
  if(!retryData)addMessage('user',message,pendingFiles.map(file=>({name:file.name})));
  $('#typing').classList.remove('hidden');
  const form=new FormData(); form.append('message',message); form.append('conversation_id',requestConversationId||'');
  form.append('use_search',useSearch?'1':'0'); pendingFiles.forEach(file=>form.append('files',file));
  if(!retryData){input.value='';input.style.height='auto';selectedFiles=[];renderFiles();}
  try{
    const data=await api('/api/chat',{method:'POST',body:form});
    if(conversationId===requestConversationId){
      conversationId=data.conversation_id; sessionStorage.setItem('echoai-conversation',conversationId);
      addMessage('assistant',data.reply);
      for(const action of data.pending_actions||[])addConfirmation(action);
      const conversations=await loadConversations();
      $('#chatTitle').textContent=conversations.find(item=>item.conversation_id===conversationId)?.title||'Chat';
    }else{
      await loadConversations();
    }
  }catch(err){
    if(conversationId===requestConversationId)addRetryMessage(message,pendingFiles,requestConversationId,useSearch,err.message);
    else toast(`Message failed in the other chat: ${err.message}`);
  }finally{
    $('#typing').classList.add('hidden'); busy=false; $('#sendBtn').disabled=false; input.focus();
  }
}
$('#chatForm').addEventListener('submit',sendMessage);
$('#messageInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();}});
$('#messageInput').addEventListener('input',e=>{e.target.style.height='auto';e.target.style.height=Math.min(e.target.scrollHeight,150)+'px';});
$('#attachBtn').onclick=()=>$('#fileInput').click();
$('#fileInput').onchange=e=>{selectedFiles.push(...Array.from(e.target.files));selectedFiles=selectedFiles.filter((f,i,a)=>a.findIndex(x=>x.name===f.name&&x.size===f.size&&x.lastModified===f.lastModified)===i);renderFiles();e.target.value='';};
function renderFiles(){const box=$('#filePreview');box.replaceChildren();selectedFiles.forEach((file,index)=>{const chip=document.createElement('span');chip.className='file-chip';chip.textContent=file.name+' ';const remove=document.createElement('button');remove.textContent='×';remove.onclick=()=>{selectedFiles.splice(index,1);renderFiles();};chip.append(remove);box.append(chip);});}
function addConfirmation(action){const row=document.createElement('div');row.className='confirm-card';row.textContent=`Delete task “${action.title}”? `;const yes=document.createElement('button');yes.className='danger';yes.textContent='Confirm delete';yes.onclick=async()=>{try{await api('/api/confirm-action',{method:'POST',body:JSON.stringify({action_id:action.action_id})});row.remove();toast('Task deleted');}catch(err){toast(err.message)}};const no=document.createElement('button');no.className='text-btn';no.textContent='Cancel';no.onclick=()=>row.remove();row.append(yes,no);messages.append(row);}

// Conversation and library panels
const drawer=$('#drawer'), backdrop=$('#panelBackdrop');
function closeDrawer(){drawer.classList.remove('open');backdrop.classList.add('hidden');}
$('#closeDrawer').onclick=closeDrawer;backdrop.onclick=closeDrawer;
document.querySelectorAll('[data-panel]').forEach(button=>button.onclick=()=>openPanel(button.dataset.panel));
async function openPanel(type){const title={memories:'Memories',documents:'Documents',tasks:'Tasks'}[type];$('#drawerTitle').textContent=title;const body=$('#drawerBody');body.replaceChildren();drawer.classList.add('open');backdrop.classList.remove('hidden');
  try{
    if(type==='memories')await renderMemories(body);
    if(type==='documents')await renderDocuments(body);
    if(type==='tasks')await renderTasks(body);
  }catch(err){body.textContent=err.message;}
}
function sectionForm(fields,submitText,onSubmit){const form=document.createElement('form');form.className='library-form';for(const [name,label,type='text'] of fields){const input=document.createElement(type==='textarea'?'textarea':'input');input.name=name;input.placeholder=label;input.setAttribute('aria-label',label);if(type!=='textarea')input.type=type;form.append(input);}const submit=document.createElement('button');submit.className='primary';submit.textContent=submitText;form.append(submit);form.onsubmit=async e=>{e.preventDefault();const values=Object.fromEntries(new FormData(form));try{await onSubmit(values);await openPanel($('#drawerTitle').textContent.toLowerCase());toast('Saved');}catch(err){toast(err.message)}};return form;}
async function renderMemories(body){body.append(sectionForm([['memory_key','Memory name'],['memory_value','What should EchoAI remember?','textarea']],'Save memory',v=>api('/api/memories',{method:'POST',body:JSON.stringify(v)})));const data=await api('/api/memories');data.memories.forEach(m=>{const card=document.createElement('div');card.className='library-card';const title=document.createElement('b');title.textContent=m.memory_key;const text=document.createElement('p');text.textContent=m.memory_value;const edit=document.createElement('button');edit.className='text-btn';edit.textContent='Edit';edit.onclick=async()=>{const key=prompt('Memory name',m.memory_key);if(key===null)return;const value=prompt('Memory text',m.memory_value);if(value===null)return;try{await api(`/api/memories/${m.memory_id}`,{method:'PUT',body:JSON.stringify({memory_key:key,memory_value:value})});await openPanel('memories')}catch(e){toast(e.message)}};const del=document.createElement('button');del.className='text-btn danger-text';del.textContent='Delete';del.onclick=async()=>{if(confirm('Delete this saved memory?')){await api(`/api/memories/${m.memory_id}`,{method:'DELETE',headers:{'X-Confirmed':'yes'}});await openPanel('memories')}};card.append(title,text,edit,del);body.append(card);});}
async function renderDocuments(body){const form=document.createElement('form');form.className='library-form';const file=document.createElement('input');file.type='file';file.accept='.pdf,.docx,.txt';file.required=true;const upload=document.createElement('button');upload.className='primary';upload.textContent='Upload document';form.append(file,upload);form.onsubmit=async e=>{e.preventDefault();const data=new FormData();data.append('file',file.files[0]);try{await api('/api/documents',{method:'POST',body:data});await openPanel('documents');toast('Document saved');}catch(err){toast(err.message)}};body.append(form);const data=await api('/api/documents');data.documents.forEach(d=>{const card=document.createElement('div');card.className='library-card';const title=document.createElement('b');title.textContent=d.filename;const meta=document.createElement('small');meta.textContent=`${Math.ceil(d.file_size/1024)} KB · ${new Date(d.created_at).toLocaleDateString()}`;const view=document.createElement('button');view.className='text-btn';view.textContent='View text';view.onclick=async()=>{try{const r=await api(`/api/documents/${d.document_id}`);let preview=card.querySelector('pre');if(!preview){preview=document.createElement('pre');preview.className='document-preview';card.append(preview);}preview.textContent=r.text;}catch(e){toast(e.message)}};const del=document.createElement('button');del.className='text-btn danger-text';del.textContent='Delete';del.onclick=async()=>{if(confirm(`Delete ${d.filename}?`)){await api(`/api/documents/${d.document_id}`,{method:'DELETE',headers:{'X-Confirmed':'yes'}});await openPanel('documents')}};card.append(title,meta,view,del);body.append(card);});}
async function renderTasks(body){body.append(sectionForm([['title','Task title'],['description','Description (optional)','textarea'],['due_date','Due date (YYYY-MM-DD)','text']],'Add task',v=>api('/api/tasks',{method:'POST',body:JSON.stringify(v)})));const data=await api('/api/tasks');data.tasks.forEach(t=>{const card=document.createElement('div');card.className='library-card task-card';const title=document.createElement('b');title.textContent=t.title;const desc=document.createElement('p');desc.textContent=(t.description||'')+(t.due_date?` · Due ${t.due_date}`:'');const edit=document.createElement('button');edit.className='text-btn';edit.textContent='Edit';edit.onclick=async()=>{const title=prompt('Task title',t.title);if(title===null)return;const description=prompt('Description',t.description||'');if(description===null)return;const due_date=prompt('Due date (YYYY-MM-DD, optional)',t.due_date||'');if(due_date===null)return;try{await api(`/api/tasks/${t.task_id}`,{method:'PATCH',body:JSON.stringify({title,description,due_date})});await openPanel('tasks')}catch(e){toast(e.message)}};const status=document.createElement('button');status.className='text-btn';status.textContent=t.status==='completed'?'Mark pending':'Complete';status.onclick=async()=>{await api(`/api/tasks/${t.task_id}`,{method:'PATCH',body:JSON.stringify({status:t.status==='completed'?'pending':'completed'})});await openPanel('tasks')};const del=document.createElement('button');del.className='text-btn danger-text';del.textContent='Delete';del.onclick=async()=>{if(confirm(`Delete task “${t.title}”?`)){await api(`/api/tasks/${t.task_id}`,{method:'DELETE',headers:{'X-Confirmed':'yes'}});await openPanel('tasks')}};card.append(title,desc,edit,status,del);body.append(card);});}

// Voice controls with native browser APIs only
function speakText(text){if(!('speechSynthesis'in window)){toast('Speech playback is not supported in this browser.');return;}if(speechSynthesis.speaking){speechSynthesis.cancel();$('#voiceStatus').textContent='';return;}const utterance=new SpeechSynthesisUtterance(text);utterance.rate=1;utterance.onend=()=>{$('#voiceStatus').textContent='';};$('#voiceStatus').textContent=' · Speaking (tap Read aloud to stop)';speechSynthesis.speak(utterance);}
if('webkitSpeechRecognition'in window||'SpeechRecognition'in window){const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;recognition=new Speech();recognition.lang=navigator.language||'en-US';recognition.interimResults=true;recognition.onresult=e=>{$('#messageInput').value=Array.from(e.results).map(r=>r[0].transcript).join('');};recognition.onend=()=>{$('#micBtn').classList.remove('recording');};$('#micBtn').onclick=()=>{try{recognition.start();$('#micBtn').classList.add('recording');}catch{recognition.stop();}};}else{$('#micBtn').onclick=()=>toast('Speech recognition is not supported in this browser.');$('#micBtn').title='Speech recognition unavailable';}
$('#themeToggle').onclick=()=>{const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=theme;localStorage.setItem('echoai-theme',theme);};
$('#menuToggle').onclick=()=>$('#sidebar').classList.toggle('open');
document.querySelectorAll('.suggestions button').forEach(b=>b.onclick=()=>{$('#messageInput').value=b.textContent;$('#messageInput').focus();});
async function init(){
  document.documentElement.dataset.theme=localStorage.getItem('echoai-theme')||'dark';
  try{
    const me=await api('/api/me');
    $('#username').textContent=me.username; $('#userAvatar').textContent=me.username.slice(0,1).toUpperCase();
    const conversations=await loadConversations();
    const remembered=conversations.find(item=>item.conversation_id===conversationId);
    if(remembered)await selectConversation(remembered.conversation_id);
    else if(conversations.length)await selectConversation(conversations[0].conversation_id);
    else{
      conversationId=null; sessionStorage.removeItem('echoai-conversation');
      messages.replaceChildren(); welcome.classList.remove('hidden'); $('#chatTitle').textContent='New chat';
    }
  }catch(err){toast(err.message);}
}
init();
