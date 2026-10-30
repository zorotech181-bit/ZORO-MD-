import axios from 'axios'
import stylizedChar from '../utils/fancy.js';
import stylizedCardMessage from '../utils/messageStyle.js';



async function tiktok(client, message){
    const remoteJid = message.key?.remoteJid;
    const messageBody = message.message?.extendedTextMessage?.text || message.message?.conversation ;
    const args = messageBody.slice(1).trim().split(/\s+/)[1];

    if(!args){
        await client.sendMessage(remoteJid, { text: stylizedChar(" ✨ jєαn-s dєv | σвítσ dєv said plz provide a tiktok link: Ex: tiktok https://vm.tiktok.com ✨")})
        return ;
    }
    if(!args.includes('tiktok.com')){
        await client.sendMessage(remoteJid, { text: stylizedChar(" ⚠️ That doesn't look like a valid TikTok link.")})
        return;
    }

    await client.sendMessage(remoteJid, {text: stylizedChar(" 🚀 Initiating download... Please be patient! ⏳ ")});
    
    try {
        const apiUrl =  `https://delirius-apiofc.vercel.app/download/tiktok?url=${args}`;
        const {data} = await axios.get(apiUrl);

        if (!data.status || !data.data){
            await client.sendMessage(remoteJid, {text: stylizedChar(' 💔 failed to download this tiktok video')})
            return;
        }

        const {title, like, comment, share, author, meta} = data.data;
        const videoUrl = meta.media.find(v => v.type === "video")?.org;
        const views = meta?.play_count || 'N/A';

        if(!videoUrl){
            await client.sendMessage(remoteJid, {text: stylizedChar("⚠️ could not retrieve the video Url")});
            return;
        }

        const caption = stylizedChar(`🎬 *TikTok Video Downloaded!* 🎬\n\n
        +
                      👤 *Creator:*  ${author.nickname} (@${author.username})\n 
                      📝 *Title:*  ${title || 'No title available'}\n 
                      👁️ *Views:*  ${views}\n 
                      ❤️ *Likes:*  ${like}\n 
                      💬 *Comments:* ${comment}\n
                      🔗 *Share:* ${share}\n\n 
                        ᴘᴏᴡᴇʀᴇᴅ ʙʏ jєαn-s dєv | σвítσ dєv ! 😉`);

                      await client.sendMessage(remoteJid, {
                        video: { url: videoUrl },
                        caption: caption,
                        contextInfo: { mentionedJid: [message.key.participant || remoteJid] }
                      }, { quoted: message });


                
    } catch (e) {
        console.error("🔥 Error duing TikTok download:", e);
        await client.sendMessage(remoteJid, {text :stylizedChar(`🚨 An error occurred: ${e.message} 🚨`)});
        
                

    }




 
}

export default tiktok ;