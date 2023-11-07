let code =  `
struct group_info init_groups = { .usage = ATOMIC_INIT(2) };<br>
struct group_info *groups_alloc(int gidsetsize){<br>
<br>
<br>    struct group_info *group_info;<br>
<br>
<br>    int nblocks;<br>
<br>
<br>    int i;<br>
<br>
<br>
<br>
<br>    nblocks = (gidsetsize + NGROUPS_PER_BLOCK - 1) / NGROUPS_PER_BLOCK;<br>
<br>
<br>    /* Make sure we always allocate at least one indirect block pointer */<br>
<br>
<br>    nblocks = nblocks ? : 1;<br>
<br>
<br>    group_info = kmalloc(sizeof(*group_info) + nblocks*sizeof(gid_t *), GFP_USER);<br>
<br>
<br>    if (!group_info)<br>
<br>
<br>        return NULL;<br>
<br>
<br>    group_info->ngroups = gidsetsize;<br>
<br>
<br>    group_info->nblocks = nblocks;<br>
<br>
<br>    atomic_set(&group_info->usage, 1);<br>
<br>
<br>
<br>
<br>    if (gidsetsize <= NGROUPS_SMALL)<br>
<br>
<br>        group_info->blocks[0] = group_info->small_block;<br>
<br>
<br>    else {<br>
<br>
<br>        for (i = 0; i < nblocks; i++) {<br>
<br>
<br>            gid_t *b;<br>
<br>
<br>            b = (void *)__get_free_page(GFP_USER);<br>
<br>
<br>            if (!b)<br>
<br>
<br>                goto out_undo_partial_alloc;<br>
<br>
<br>            group_info->blocks[i] = b;<br>
<br>
<br>        }<br>
<br>
<br>    }<br>
<br>
<br>    return group_info;<br>
<br>
<br>
<br>
<br>out_undo_partial_alloc:<br>
<br>
<br>    while (--i >= 0) {<br>
<br>
<br>        free_page((unsigned long)group_info->blocks[i]);<br>
<br>
<br>    }<br>
<br>
<br>    kfree(group_info);<br>
<br>
<br>    return NULL;<br>
<br>
<br>}<br>
<br>
<br>
<br>
<br>EXPORT_SYMBOL(groups_alloc);<br>
<br>
<br>
<br>
<br>void groups_free(struct group_info *group_info)<br>
<br>
<br>{<br>
<br>
<br>    if (group_info->blocks[0] != group_info->small_block) {<br>
<br>
<br>        int i;<br>
<br>
<br>        for (i = 0; i < group_info->nblocks; i++)<br>
<br>
<br>            free_page((unsigned long)group_info->blocks[i]);<br>
<br>
<br>    }<br>
<br>
<br>    kfree(group_info);<br>
<br>
<br>}<br>
<br>
<br>
<br>
<br>EXPORT_SYMBOL(groups_free);<br>
<br>
<br>
<br>
<br>/* export the group_info to a user-space array */<br>
<br>
<br>static int groups_to_user(gid_t __user *grouplist,<br>
<br>
<br>              const struct group_info *group_info)<br>
<br>
<br>{<br>
<br>
<br>    int i;<br>
<br>
<br>    unsigned int count = group_info->ngroups;<br>
<br>
<br>
<br>
<br>    for (i = 0; i < group_info->nblocks; i++) {<br>
<br>
<br>        unsigned int cp_count = min(NGROUPS_PER_BLOCK, count);<br>
<br>
<br>        unsigned int len = cp_count * sizeof(*grouplist);<br>
<br>
<br>
<br>
<br>        if (copy_to_user(grouplist, group_info->blocks[i], len))<br>
<br>
<br>            return -EFAULT;<br>
<br>
<br>
<br>
<br>        grouplist += NGROUPS_PER_BLOCK;<br>
<br>
<br>        count -= cp_count;<br>
<br>
<br>    }<br>
<br>
<br>    return 0;<br>
<br>
<br>}<br>
<br>
<br>
<br>
<br>/* fill a group_info from a user-space array - it must be allocated already */<br>
<br>
<br>static int groups_from_user(struct group_info *group_info,<br>
<br>
<br>    gid_t __user *grouplist)<br>
<br>
<br>{<br>
<br>
<br>    int i;<br>
<br>
<br>    unsigned int count = group_info->ngroups;<br>
<br>
<br>
<br>
<br>    for (i = 0; i < group_info->nblocks; i++) {<br>
<br>
<br>        unsigned int cp_count = min(NGROUPS_PER_BLOCK, count);<br>
<br>
<br>        unsigned int len = cp_count * sizeof(*grouplist);<br>
<br>
<br>
<br>
<br>        if (copy_from_user(group_info->blocks[i], grouplist, len))<br>
<br>
<br>            return -EFAULT;<br>
<br>
<br>
<br>
<br>        grouplist += NGROUPS_PER_BLOCK;<br>
<br>
<br>        count -= cp_count;<br>
<br>
<br>    }<br>
<br>
<br>    return 0;<br>
<br>
<br>}<br>
<br>
<br>
<br>
<br>/* a simple Shell sort */<br>
<br>
<br>static void groups_sort(struct group_info *group_info)<br>
<br>
<br>{<br>
<br>
<br>    int base, max, stride;<br>
<br>
<br>    int gidsetsize = group_info->ngroups;<br>
<br>
<br>
<br>
<br>    for (stride = 1; stride < gidsetsize; stride = 3 * stride + 1)<br>
<br>
<br>        ; /* nothing */<br>
<br>
<br>    stride /= 3;<br>
<br>
<br>
<br>
<br>    while (stride) {<br>
<br>
<br>        max = gidsetsize - stride;<br>
<br>
<br>        for (base = 0; base < max; base++) {<br>
<br>
<br>            int left = base;<br>
<br>
<br>            int right = left + stride;<br>
<br>
<br>            gid_t tmp = GROUP_AT(group_info, right);<br>
<br>
<br>
<br>
<br>            while (left >= 0 && GROUP_AT(group_info, left) > tmp) {<br>
<br>
<br>                GROUP_AT(group_info, right) =<br>
<br>
<br>                    GROUP_AT(group_info, left);<br>
<br>
<br>                right = left;<br>
<br>
<br>                left -= stride;<br>
<br>
<br>            }<br>
<br>
<br>            GROUP_AT(group_info, right) = tmp;<br>
<br>
<br>        }<br>
<br>
<br>        stride /= 3;<br>
<br>
<br>    }<br>
<br>
<br>}<br>
<br>
<br>
<br>
<br>/* a simple bsearch */<br>
<br>
<br>int groups_search(const struct group_info *group_info, gid_t grp)<br>
<br>
<br>{<br>
<br>
<br>    unsigned int left, right;<br>
<br>
<br>
<br>
<br>    if (!group_info)<br>
<br>
<br>        return 0;<br>
<br>
<br>
<br>
<br>    left = 0;<br>
<br>
<br>    right = group_info->ngroups;<br>
<br>
<br>    while (left < right) {<br>
<br>
<br>        unsigned int mid = (left+right)/2;<br>
<br>
<br>        if (grp > GROUP_AT(group_info, mid))<br>
<br>
<br>            left = mid + 1;<br>
<br>
<br>        else if (grp < GROUP_AT(group_info, mid))<br>
<br>
<br>            right = mid;<br>
<br>
<br>        else<br>
<br>
<br>            return 1;<br>
<br>
<br>    }<br>
<br>
<br>    return 0;<br>
<br>
<br>}<br>
<br>
<br>
<br>
<br>/**<br>
<br> * set_groups - Change a group subscription in a set of credentials<br>
<br> * @new: The newly prepared set of credentials to alter<br>
<br> * @group_info: The group list to install<br>
<br> *<br>
<br> * Validate a group subscription and, if valid, insert it into a set<br>
<br> * of credentials.<br>
<br> */<br>
<br>
<br>int set_groups(struct cred *new, struct group_info *group_info)<br>
<br>
<br>{<br>
<br>
<br>    put_group_info(new->group_info);<br>
<br>
<br>    groups_sort(group_info);<br>
<br>
<br>    get_group_info(group_info);<br>
<br>
<br>    new->group_info = group_info;<br>
<br>
<br>    return 0;<br>
<br>
<br>}<br>
<br>
<br>
<br>
<br>EXPORT_SYMBOL(set_groups);<br>
<br>
<br>
<br>
<br>/**<br>
<br> * set_current_groups - Change current's group subscription<br>
<br> * @group_info: The group list to impose<br>
<br> *<br>
<br> * Validate a group subscription and, if valid, impose it upon current's task<br>
<br> * security record.<br>
<br> */<br>
<br>
<br>int set_current_groups(struct group_info *group_info)<br>
<br>
<br>{<br>
<br>
<br>    struct cred *new;<br>
<br>
<br>    int ret;<br>
<br>
<br>
<br>
<br>    new = prepare_creds();<br>
<br>
<br>    if (!new)<br>
<br>
<br>        return -ENOMEM;<br>
<br>
<br>
<br>
<br>    ret = set_groups(new, group_info);<br>
<br>
<br>    if (ret < 0) {<br>
<br>
<br>        abort_creds(new);<br>
<br>
<br>        return ret;<br>
<br>
<br>    }<br>
<br>
<br>
<br>
<br>    return commit_creds(new);<br>
<br>
<br>}<br>
<br>
<br>
<br>
<br>EXPORT_SYMBOL(set_current_groups);<br>
<br>
<br>
<br>
<br>SYSCALL_DEFINE2(getgroups, int, gidsetsize, gid_t __user *, grouplist)<br>
<br>
<br>{<br>
<br>
<br>    const struct cred *cred = current_cred();<br>
<br>
<br>    int i;<br>
<br>
<br>
<br>
<br>    if (gidsetsize < 0)<br>
<br>
<br>        return -EINVAL;<br>
<br>
<br>
<br>
<br>    /* no need to grab task_lock here; it cannot change */<br>
<br>
<br>    i = cred->group_info->ngroups;<br>
<br>
<br>    if (gidsetsize) {<br>
<br>
<br>        if (i > gidsetsize) {<br>
<br>
<br>            i = -EINVAL;<br>
<br>
<br>            goto out;<br>
<br>
<br>        }<br>
<br>
<br>        if (groups_to_user(grouplist, cred->group_info)) {<br>
<br>
<br>            i = -EFAULT;<br>
<br>
<br>            goto out;<br>
<br>
<br>        }<br>
<br>
<br>    }<br>
<br>
<br>out:<br>
<br>
<br>    return i;<br>
<br>
<br>}<br>
<br>
<br>
<br>
<br>/*<br>
<br> *    SMP: Our groups are copy-on-write. We can set them safely<br>
<br> *    without another task interfering.<br>
<br> */<br>
<br>
<br>
<br>
<br>SYSCALL_DEFINE2(setgroups, int, gidsetsize, gid_t __user *, grouplist)<br>
<br>
<br>{<br>
<br>
<br>    struct group_info *group_info;<br>
<br>
<br>    int retval;<br>
<br>
<br>
<br>
<br>    if (!nsown_capable(CAP_SETGID))<br>
<br>
<br>        return -EPERM;<br>
<br>
<br>    if ((unsigned)gidsetsize > NGROUPS_MAX)<br>
<br>
<br>        return -EINVAL;<br>
<br>
<br>
<br>
<br>    group_info = groups_alloc(gidsetsize);<br>
<br>
<br>    if (!group_info)<br>
<br>
<br>        return -ENOMEM;<br>
<br>
<br>    retval = groups_from_user(group_info, grouplist);<br>
<br>
<br>    if (retval) {<br>
<br>
<br>        put_group_info(group_info);<br>
<br>
<br>        return retval;<br>
<br>
<br>    }<br>
<br>
<br>
<br>
<br>    retval = set_current_groups(group_info);<br>
<br>
<br>    put_group_info(group_info);<br>
<br>
<br>
<br>
<br>    return retval;<br>
<br>
<br>}<br>
<br>
<br>
<br>
<br>/*<br>
<br> * Check whether we're fsgid/egid or in the supplemental group..<br>
<br> */<br>
<br>
<br>int in_group_p(gid_t grp)<br>
<br>
<br>{<br>
<br>
<br>    const struct cred *cred = current_cred();<br>
<br>
<br>    int retval = 1;<br>
<br>
<br>
<br>
<br>    if (grp != cred->fsgid)<br>
<br>
<br>        retval = groups_search(cred->group_info, grp);<br>
<br>
<br>    return retval;<br>
<br>
<br>}<br>
<br>
<br>
<br>
<br>EXPORT_SYMBOL(in_group_p);<br>
<br>
<br>
<br>
<br>int in_egroup_p(gid_t grp)<br>
<br>
<br>{<br>
<br>
<br>    const struct cred *cred = current_cred();<br>
<br>
<br>    int retval = 1;<br>
<br>
<br>
<br>
<br>    if (grp != cred->egid)<br>
<br>
<br>        retval = groups_search(cred->group_info, grp);<br>
<br>
<br>    return retval;<br>
<br>
<br>}<br>
<br> `





////////////////////////////////////////////////////////////////////////////////////////////////////////////////////



var lastWord;
var lastWordQueue;
let writed;
let write;
let upperCaseA = false;
let logContent;
let settings = false;
let autoCode = false;
let names
let speed = 100
let oldSpeed = 100
let sendedLogs = []


function settingsDisplay() {
let settingsDs = document.getElementById("settings")

if(settings === false) {
settingsDs.style.display = "block"
settings = true
 

return
}


if(settings === true) {
    settingsDs.style.display = "none"
settings = false

    return
}

    

}

function bottom() {
    document.getElementById( 'bottom' ).scrollIntoView();

};


function sendLog(log) {

let consoleArea = document.getElementById("consoleArea")
let logArea = document.getElementById("logArea")

let randomLogs = ["npm ERR! Error: 7684:error:140770FC:SSL routines:SSL23_GET_SERVER_HELLO:unknown protocol:openssl\ssl\s23_clnt.c:787:", "npm ERR! Error: SSL Error: CERT_UNTRUSTED","npm ERR! Error: SSL Error: UNABLE_TO_VERIFY_LEAF_SIGNATURE","npm ERR! Error: SSL Error: SELF_SIGNED_CERT_IN_CHAIN","npm http 500 https://registry.npmjs.org/phonegap","Error: Invalid JSON","npm ERR! SyntaxError: Unexpected token <","npm ERR! registry error parsing json","npm ERR! Error: 404 Not Found","npm ERR! fetch failed https://registry.npmjs.org/faye-websocket/-/faye-websocket-0.7.0.tgz","npm http 404 https://registry.npmjs.org/faye-websocket/-/faye-websocket-0.7.0.tgz"]


let logLucky = Math.floor(Math.random() * 10)


if(sendedLogs.length >= 3) {
    let firstLog = sendedLogs[0]
    
    sendedLogs = sendedLogs.splice(1, sendedLogs.length)
    logContent = logContent.replace(firstLog+"<br><br>", "")
    
    
    }


if(!log && logLucky == 1) {

    let port = Math.floor(Math.random() * 9999)

 let errorText = "<span style='color: #c8ffc8'> ✅ <i>Connection successfully established Port: "+port+"</i></span>"
sendedLogs.push(errorText)

    if(!logContent) {
        logArea.innerHTML= errorText
        logContent = errorText
        sendedLogs.push(errorText)
        } else {
        
        logArea.innerHTML = logContent+"<br><br>"+errorText
        logContent = logContent+"<br><br>"+errorText
        
        
        }
return

}

var errorText = randomLogs[Math.floor(Math.random()*randomLogs.length)];

if(log) errorText = log
else {
errorText= errorText.replace("ERR!", '<span style="color:red">ERR!</span>')
errorText= errorText.replace("Error", '<span style="color:red">Error</span>')
errorText= errorText.replace("failed", '<span style="color:blue">failed</span>')
errorText= errorText.replace("Unexpected", '<span style="color:yellow">Unexpected</span>')
errorText= errorText.replace("Invalid", '<span style="color:yellow">Invalid</span>')
errorText= errorText.replace("unknown", '<span style="color:yellow">unknown</span>')
errorText= errorText.replace("json", '<span style="color:orange">json</span>')
errorText= errorText.replace("json", '<span style="color:orange">Not Found</span>')
errorText= errorText.replace("404", '<span style="color:cyan">Not Found</span>')
}

sendedLogs.push(errorText)



if(!logContent) {
logArea.innerHTML= errorText
logContent = errorText
sendedLogs.push(errorText)
} else {

logArea.innerHTML = logContent+"<br><br>"+errorText
logContent = logContent+"<br><br>"+errorText


}

}

function autoCodeStart() {
console.log(speed)
    setInterval(int => {
   
        if(autoCode === false) return;
        if(oldSpeed !== speed) {
            console.log("degismis")
           oldSpeed = speed 
         autoCodeStart()
         clearInterval(int)
         return;
    }
        writeCode("a")   
        
        }, speed);

}


function autoCodeWr() {


    if(autoCode === false) {
    autoCode = true
    autoCodeStart()
  document.getElementById("speedArea").style.display = "block"
    document.getElementById("autoCodeArea").innerHTML = `
    <h3>AUTO CODE</h3>
    <button id="autoCodeBtn" onclick="autoCodeWr()">Disable</button>
    `
    sendLog('<i style="color: #2a9081"> <i class="fas fa-toggle-on"></i> Auto code successfully enabled</i>')

    return
    }
    
    
    if(autoCode === true) {
    autoCode = false  
  document.getElementById("speedArea").style.display = "none"
    document.getElementById("autoCodeArea").innerHTML = `
    <h3>AUTO CODE</h3>
    <button id="autoCodeBtn" onclick="autoCodeWr()">Enable</button>
    `
    sendLog('<i style="color: red"> <i class="fas fa-toggle-off"></i> Auto code successfully disabled</i>')

    return
    }
    
        

}

function changeSpeed(speeda) {

let ms;
if(speeda === "fast") ms = 100
if(speeda === "faster") ms = 50
if(speeda === "super") ms = 25

speed = ms

sendLog('<i style="color: #f6fe07"> <i class="fas fa-tachometer-alt"></i> Speed set to '+speeda+' successfully </i>')

}

function changeColor(colora) {

console.log("geldi")
document.getElementById("codeText").style.color=colora
document.getElementById("colorChangeBtn").value = colora
document.getElementById("consoleArea").style.border = " 3px solid "+colora
document.getElementById("settings").style.border = " 3px solid "+colora

sendLog('<i style="color: '+colora+'"> <i class="fas fa-palette"></i> Color Changed to '+colora+"</i>")
}

async function writeCode(key) {




if(settings === true) return;    
let logLucky = Math.floor(Math.random() * 14)

if(logLucky == 1) sendLog()


let codeTag = document.getElementById("codeText") 
let program;
if(!lastWord) program = "başlat"
if(lastWord) program = "devam"

if(key.key === "Backspace") {

if(!lastWord) return;

let yeni = writed.replace(lastWord, "") 

if(names) yeni.replace("int", '<span style="color: red">'+names+"</span>")
codeTag.innerHTML = `<p id="codeText" class="codeText">${yeni} <span id="cursor" class="cursor">|</span></p>`

let a = lastWordQueue-String(lastWord).length
lastWordQueue = a
writed = yeni
lastWord = yeni
return;
}

if(key.key === "CapsLock") {
if(upperCaseA === false) {
    
upperCaseA = true;
let capsWarn = document.getElementById("caps")
let capsArea = document.getElementById("infoArea")

capsWarn.innerHTML="Caps Lock"
capsArea.style.display = "block"

}else {
upperCaseA = false;

let capsWarn = document.getElementById("caps")
let capsArea = document.getElementById("infoArea")

capsWarn.innerHTML=""
capsArea.style.display = "none"


}
return;
}





let randomNum = Math.floor(Math.random() * 20)

if(program === "başlat") {
write = code.slice(0, randomNum)

if(upperCaseA === true) write = String(write).toUpperCase()
lastWordQueue = randomNum
writed = write
lastWord = write

if(names) write = write.replace("int", '<span style="color: red">'+names+"</span>")
codeTag.innerHTML = `<p id="codeText" class="codeText">${write} <span id="cursor" class="cursor">|</span></p>`

}

bottom()
if(program === "devam") {

randomNum = lastWordQueue+randomNum
write = code.slice(lastWordQueue, randomNum)
if(upperCaseA === true) write = String(write).toUpperCase()

lastWordQueue = randomNum
write = write.replace(/ /g, '&nbsp');
writed = writed+write

if(!write) lastWord = "boşluk kardeşim"
else lastWord = write  

if(names) writed = writed.replace("int", '<span style="color: red">'+names+"</span>")

codeTag.innerHTML = `<p id="codeText" class="codeText">${writed} <span id="cursor" class="cursor">|</span></p>`




}
}

async function changeName(writedName) {
names = writedName

sendLog('<i style="color: #ffd351"> <i class="fas fa-pen"></i> Name set to '+writedName+' successfully </i>')

}








setInterval(() => {
    let cursor = document.getElementById("cursor")     
 
cursor.style.color = "rgb(0, 255, 0)"
cursor.style.fontSize = "16px"
cursor.style.fontWeight = "bolder"
setTimeout(() => {
    cursor.style.color = "transparent"
    
}, 300);

}, 600);




document.addEventListener('keyup', (e) => {

writeCode(e)

})