"use strict";
// ---------------------------------------------------------------- the words on screen in Chinese or in English
// The interface is written in Chinese; English is a dictionary laid over it, looked up by the Chinese text itself. So every other module
// keeps naming things in Chinese (runs, views, animals, the Variants rows) and nothing outside this file and the interface has to change:
// the interface passes what it shows through I18N.t. A string missing here simply shows in Chinese.
// Which language: ?lang=zh|en in the address, else the player's own pick in the menu (kept in the browser), else the browser's language:
// any zh* is Chinese, everything else English.
const I18N = (() => {
  const EN = {
    
    // ---- title and loading
    '一个人，一座山，一直往下': 'One skier, one mountain, all the way down',
    '沉浸模式': 'Immersive', '捏一下手指 出发': 'Pinch to start', '左右歪头转弯 · 转弯时头往后压刃拐急，头往前搓雪减速': 'Lean your head to turn · head back in a turn to carve tighter, forward to skid and slow',
    '右手捏住 蹲低加速 · 左手捏住 蓄力，松开起跳': 'Right pinch held: tuck · Left pinch held: load a jump, let go to fly', '按数码表冠退出': 'Press the Digital Crown to leave',
    '出发': 'Start', '自由滑': 'Free ski', '挑战': 'Challenge', '场景': 'Scene', '视角': 'Views', '一起滑': 'Ski together', '操作': 'Controls', '回车': 'Enter', '静音': 'Mute', '全屏': 'Full screen', '退出全屏': 'Exit full screen',
    '画面和声音全部由代码实时生成，没有一张贴图、一段录音。戴上耳机更好。': 'Every picture and every sound is made live by code: not one texture, not one recording. Best with headphones.',
    '画面和声音全部由代码实时生成，戴上耳机更好。': 'Every picture and every sound is made live by code. Best with headphones.',
    '← → 或 A D 转弯 · 空格 跳 · ↓ 或 S 加速': '← → or A D to turn · Space to jump · ↓ or S to tuck',
    '按住屏幕左右拖动转弯': 'Hold and drag left or right to turn',
    '倾斜手机或按住屏幕左右拖动转弯': 'Tilt the phone, or hold and drag, to turn',
    '右下角 跳 / 加速': 'Jump and Tuck at bottom right',
    '倾斜手机转弯，或按住屏幕左右拖动': 'Tilt the phone to turn, or hold and drag',
    '醒来': 'waking', '磨雪': 'grinding snow', '远山与城市': 'far ranges and the city', '立起天空': 'raising the sky', '林子里有鹿': 'deer in the woods',
    '种树': 'planting trees', '点亮星云': 'lighting the nebula', '调音': 'tuning', '调光': 'setting the light', '铺雪': 'laying the snow', '第一缕光': 'first light', '启动用时': 'Start-up', '声音': 'sound',
    '这台设备的浏览器不支持 WebGL2，画面无法启动。': 'This browser does not support WebGL2, so the picture cannot start.',
    // ---- in a run
    '落差 M': 'DROP M', '落差': 'DROP', '距离 M': 'DISTANCE M', '距离 KM': 'DISTANCE KM', '极速 KM/H': 'TOP KM/H', '飞行 M': 'AIR M', '飞行 ': 'AIR ',
    '日出': 'Sunrise', '日落': 'Sunset', '加速': 'Tuck', '跳': 'Jump', '换视角': 'Change view', '菜单': 'Menu', '声音开关': 'Sound on or off', '暂停': 'Paused',
    '像握方向盘一样倾斜手机': 'Tilt the phone like a steering wheel',
    '左手左右推或倾斜手机转弯，转弯时往上推前压搓雪减速，往下推后压压刃拐急': 'Push the left thumb across, or tilt the phone, to turn; in a turn push up (Fore) to skid and slow, down (Aft) to carve tighter',
    '左手左右推转弯，转弯时往上推前压搓雪减速，往下推后压压刃拐急': 'Push the left thumb across to turn; in a turn push up (Fore) to skid and slow, down (Aft) to carve tighter',
    '左手往上推「前压」：转弯时搓雪减速 · 往下推「后压」：压刃拐急': 'Left thumb up, Fore: skid and slow in a turn · down, Aft: carve tighter',
    '左手 左右推': 'Left thumb across', '转弯。屏幕上任意处按住都行，推得越远转得越急': 'Turn. Hold anywhere on the screen; the further you push, the harder the turn',
    '左手 往上推': 'Left thumb up', '前压：转弯时板尾甩出去搓雪，用来减速': 'Fore: in a turn the tails swing out and skid, to slow down',
    '左手 往下推': 'Left thumb down', '后压：转弯时压刃，弯拐得更急、咬得更稳': 'Aft: in a turn the edges bite, a tighter, firmer turn',
    '斜着推': 'Diagonally', '转弯和前压 / 后压一起': 'Turn and Fore / Aft together',
    '像方向盘一样左右倾也能转弯，可以和左手一起用': 'Tip it like a steering wheel to turn too, together with the left thumb',
    '搓雪减速': 'skid, slow', '压刃拐急': 'carve tight', '前压': 'Fore', '后压': 'Aft', '倾斜手机': 'Tilt the phone',
    '连着转弯，把雪扬起来': 'Link your turns, throw up the snow', '按住「跳」蓄力，松开起跳': 'Hold Jump to load up, let go to fly',
    '← → 转弯 · 转弯时按 ↓ 压刃拐急 · ↑ 搓雪减速 · 空格 跳 · Shift 加速': '← → to turn · ↓ in a turn to carve tighter · ↑ to skid and slow · Space to jump · Shift to tuck',
    '按住屏幕，左右拖转弯，转弯时往下拖压刃拐急，往上拖搓雪减速': 'Hold and drag: across to turn, down in a turn to carve tighter, up to skid and slow',
    '转弯时按住 ↓ 压刃拐急 · ↑ 搓雪减速 · 空格 跳': 'Hold ↓ in a turn to carve tighter · ↑ to skid and slow · Space to jump',
    '压刃：转弯时按住，人蹲得更低、板子立得更陡，弯拐得更急也咬得更稳；直滑时按住，重心坐到板尾': 'Drive the edges: held in a turn you go lower and tip the skis up further, so the turn is tighter and holds better; held running straight you sit back over the tails',
    '压板头：板头吃雪、板尾甩出去搓雪，用来减速': 'Weight on the tips: the tips dig in and the tails skid out, to slow you down',
    '上下拖动': 'Drag up / down', '转弯时往下拖压刃拐急，往上拖搓雪减速': 'Down in a turn carves tighter, up skids to slow you', '前后重心': 'Fore / aft',
    '空格 跳（按住蓄力） · ↓ 加速': 'Space to jump (hold to load up) · ↓ to tuck', '← →  或  A D  转弯': '← →  or  A D  to turn',
    '画面断开了': 'THE PICTURE WAS LOST', '点一下重新上山': 'Tap to ski again',
    // ---- 光圈挑战, its replay and its route card (92_rings.js, 93_replay.js, 94_routecard.js; 用户 2026-11-19 00:52 UTC: 中文模式出现了 Challenge)
    '轻松': 'Easy', '标准': 'Standard', '难': 'Hard', '速降线': 'Downhill line', '越野线': 'Backcountry line',
    '沿主路，从山顶到山脚': 'Down the main run, top to bottom', '钻树林、走侧道，从山顶到山脚': 'Through the trees and side trails, top to bottom',
    '回放': 'Replay', '上一场回放': 'Last replay', '路线卡': 'Route card', '退出回放': 'Leave replay', '播放/暂停': 'Play / pause', '从头': 'From the start',
    '隐藏': 'Hide', '更多': 'More', '侧面': 'Side', '环绕': 'Orbit', '转播': 'Broadcast', '终点': 'Finish',
    '光圈': 'Rings', '奖励': 'bonus', '罚时': 'penalty', ' 秒': ' s', '用时': 'Time', '光圈奖励': 'Ring bonus', '最快': 'Top',
    '最快 km/h': 'Top km/h', '滑行 km': 'Distance km', '落差 m': 'Drop m', '腾空 s': 'Air s', '腾空': 'Air', '线宽 = 速度 km/h': 'Line width = speed km/h',
    '漏掉的圈': 'Missed rings', '最快的一站': 'Fastest stage', '一路的速度': 'Speed along the run',
    '正在画这条线…': 'Drawing your line…', '截图或保存，发给朋友': 'Take a screenshot or save it, and send it to a friend', '这张卡没画出来': 'This card could not be drawn',
    '这里存不了图，截图就好': 'Saving is not possible here: take a screenshot instead', '保存图片': 'Save image', '关闭': 'Close',
    // ---- the runs (Course: SEG_NAMES), the hours, the weather, the views, the animals
    '开阔大坡': 'Open Bowl', '陡坡': 'The Steeps', '树林': 'Glade', '起伏': 'Rollers', '雪槽': 'Gully', '跳台': 'Kickers', '深粉雪': 'Deep Powder', '山脊': 'Ridge', '蘑菇': 'Moguls', '林道': 'Forest Lane',
    '自动': 'Auto', '白天': 'Day', '傍晚': 'Golden hour', '黄昏': 'Dusk', '夜晚': 'Night', '黎明': 'Dawn',
    '晴': 'Clear', '小雪': 'Light snow', '中雪': 'Snow', '大雪': 'Heavy snow', '雷暴雪': 'Thundersnow',
    '上午': 'Morning', '中午': 'Midday', '下午': 'Afternoon', '固定': 'Held',
    '追尾': 'Chase', '第一人称': 'First person', '雪板尖': 'Ski tips', '贴雪': 'Low', '俯瞰': 'Overhead', '左侧': 'Left side', '右侧': 'Right side', '正面': 'Front', '远摄': 'Telephoto',
    '鹿': 'Deer', '雪兔': 'Snow hare', '狐狸': 'Fox', '北山羊': 'Ibex', '金雕': 'Golden eagle', '动物': 'Animal', '航班': 'Airliner',
    // ---- what a key changed, said for a moment
    '时间': 'Time', '天气': 'Weather', '路段': 'Runs', '山': 'Mountain', '偶遇': 'Encounters',
    'say:时间': 'TIME', 'say:天气': 'WEATHER', 'say:路段': 'RUN', 'say:山': 'MOUNTAIN', 'say:偶遇': 'ENCOUNTER', 'say:视角': 'VIEW',
    '航班 · 还在天上': 'Airliner · still up there', '航班 · 看左上方': 'Airliner · look up to the left', '航班 · 看右上方': 'Airliner · look up to the right',
    // ---- the menu
    'PAUSED · 暂停': 'PAUSED', 'MENU · 菜单': 'MENU', '继续滑': 'Ski on',
    // ---- 拍照 (photo mode)
    '拍照': 'Photo', 'PHOTO · 拍照': 'PHOTO', '返回': 'Back', '复位': 'Reset', '隐藏文字': 'Hide text', '升高': 'Up', '降低': 'Down',
    '暂停菜单里点「拍照」：时间全部停住，界面收起，自由移动镜头取景，再按快门存图。': 'Photo, in the pause menu: time stops, the interface goes away, move the lens anywhere and press the shutter to save the picture.',
    '保存到相册': 'Save', '继续拍': 'Keep shooting', '也可以长按图片保存': 'Or press and hold the picture to save it',
    '已保存': 'Saved', '没能拍下来': 'Could not take the picture',
    '右边拖动转视角 · 左边摇杆移动 · 双指缩放': 'Drag on the right to look · stick on the left to move · pinch to zoom',
    '拖动鼠标转视角 · WASD 移动 · Q E 升降 · 滚轮缩放 · Z C 歪斜 · R 复位 · H 隐藏文字': 'Drag to look · WASD to move · Q E down / up · wheel to zoom · Z C tilt · R reset · H hide text',
    '天色与天气': 'Time & weather', '换一座山': 'New mountain', '操作说明': 'Controls', '设置': 'Settings', '回到山顶': 'Back to the top', '版本对比': 'Versions',
    '分享': 'Share', 'SHARE · 分享': 'SHARE', '发一篇笔记': 'Post a note', '存到相册': 'Save to photos', '关注作者': 'Follow the author', '已关注作者': 'Following the author',
    '已存到相册': 'Saved to photos', '没能存到相册': 'Could not save to photos', '没能打开发笔记': 'Could not open the note editor',
    '已关注，谢谢': 'Following. Thank you', '今天不能再提示关注了': 'No more follow prompts today', '正在截图…': 'Taking the picture…',
    '把此刻的画面带进一篇笔记，速度、落差和这座山会写在正文里，发之前都可以改。': 'Takes the picture as it is now into a new note, with your speed, drop and this mountain in the text. You can change all of it before posting.',
    '喜欢这座山，可以关注做它的人，新的版本会先在主页发。': 'If you like this mountain, follow the person who made it: new versions are posted there first.',
    '排行榜': 'Leaderboard', 'RANKING · 排行榜': 'LEADERBOARD', '极速': 'Top speed', '最远飞行': 'Longest flight', '滑雪时长': 'Time skied', '今日': 'Today', '本周': 'This week', '总榜': 'All time',
    '我': 'Me', '雪友': 'A skier', '读取中…': 'Loading…', '还没有成绩，滑一趟就会上榜': 'No score yet: ski a run and you are on it', '今天还没有人上榜': 'Nobody on the board yet today',
    '还没有人上榜': 'Nobody on the board yet', '榜单还在准备，稍后再看': 'The board is getting ready, look again soon', '暂时读不到榜单，稍后再看': 'The board cannot be read right now, look again soon',
    '今日和本周按北京时间重新开始，总榜一直保留。每人只留最好的一次。': 'Today and this week start again on Beijing time; all time is kept. Each skier keeps only their best.', '今日排名': 'Today',
    'TIME · 天色': 'TIME', 'WEATHER · 天气': 'WEATHER', 'VIEW · 视角': 'VIEW', 'RUN · 路段': 'RUN', 'ENCOUNTER · 偶遇': 'ENCOUNTER', 'MOUNTAIN · 山': 'MOUNTAIN',
    'CONTROLS · 操作说明': 'CONTROLS', 'SETTINGS · 设置': 'SETTINGS', 'VERSIONS · 版本对比': 'VERSIONS',
    '选中立刻生效，后面的画面会跟着变。「自动」让一天自己走下去，琥珀色小点是现在走到的时刻。': 'A pick shows at once in the picture behind. Auto lets the day go on by itself; the amber dot marks the hour it has reached.',
    '滑的时候按 V 依次切换，Shift+V 往回；右键拖动或 I J K L 环顾四周。': 'While skiing, V steps through them and Shift+V steps back; right-drag or I J K L to look around.',
    '滑的时候点「跳」上方的机位按钮依次切换；两指拖动环顾四周。': 'While skiing, tap the camera button above Jump to step through them; drag with two fingers to look around.',
    '选一种地形，会跳到前方最近的那一段；亮着的是你现在所在的路段。': 'Pick a kind of terrain to go to the nearest stretch of it ahead; the lit one is where you are now.',
    '选了就回到滑雪：动物会出现在前方不远处，航班从天上飞过。': 'A pick takes you back to skiing: the animal turns up a little way ahead, the airliner passes overhead.',
    '每座山由一个编号生成。地址栏里的 #seed-编号 发给别人，就是同一座山。「今日之山」每天一座，所有人同一座，北京时间零点换；从山顶一口气滑完前三段，会记下你的用时。': 'Every mountain grows from a number. Send someone the #seed-number in the address bar and they get the same mountain. Today\'s mountain is one a day, the same for everyone, and changes at midnight Beijing time; ski its first three stretches in one go from the top and your time is kept.',
    '寒烟山': 'Mount Cold Smoke', '滑过的山': 'Mountains skied', 'SKIED · 滑过的山': 'SKIED',
    '点一座山就换过去。每座山记着你在那儿的最好成绩，存在这台设备上。': 'Pick a mountain to go there. Each one keeps your bests, on this device.',
    '还没滑过': 'Not yet', '今日之山': 'Today\'s mountain', 'say:今日之山': 'TODAY\'S MOUNTAIN', '最远': 'Farthest', '你今天在这座山上：': 'Your best here today: ', '今天还没在这座山上滑过': 'Not skied here yet today', '今日之山：从山顶一口气滑完前三段的平均速度，北京时间零点换山。每人只留最好的一次。': 'Today\'s mountain: average speed over its first three stretches, skied in one go from the top. The mountain changes at midnight Beijing time. Each skier keeps only their best.', '前三段': 'First three', '滑雪时长只算总榜，一直累计。': 'Time skied is all time only, and keeps adding up.', '飞行': 'Air', '今日之山 · 前三段': 'TODAY\'S MOUNTAIN · FIRST THREE', '今日之山 · 平均速度': 'Today\'s mountain · average speed',
    '转弯（按久了会切雪）': 'Turn (hold longer to carve)', '空格': 'Space', '跳，按住蓄力': 'Jump, hold to load up', '压低加速，慢的时候撑杖': 'Tuck for speed, pole when slow',
    '右键拖　I J K L': 'Right-drag　I J K L', '环顾四周': 'Look around', '换时间 · 换天气': 'Time · weather', '下一种路段': 'Next run', '叫出动物 · 航班': 'Animal · airliner',
    '静音 · 全屏': 'Mute · full screen', '菜单 · 这一页': 'Menu · this page', '菜单 · 这一页 · 版本对比': 'Menu · this page · versions',
    '随机天气': 'Random weather', '最短': 'Shortest', '最长': 'Longest', '过渡': 'Fade', '种子': 'Seed', '不连着同一种': 'Never twice in a row', '秒': 's',
    '开场先是小雪，之后按这些数字自己换。改一个，当前这一刻就按新的重算。': 'The opening spell is light snow; after that these numbers take over. Change one and this moment is worked out again.',
    '按住拖动': 'Hold & drag', '左右拖动转弯，拖过刻度就切雪': 'Drag left or right to turn, past the mark to carve', '按住蓄力，松开起跳': 'Hold to load up, let go to fly',
    '按住压低，慢的时候自动撑杖': 'Hold to tuck; poles by itself when slow', '机位': 'Camera', '两指拖动': 'Two-finger drag', 'Shift + 字母 往回切换。': 'Shift + the letter steps back.',
    '声音 开': 'Sound on', '声音 关': 'Sound off', '画质 自动': 'Quality: auto', '画质 高': 'Quality: high', '画质 均衡': 'Quality: balanced', '画质 流畅': 'Quality: smooth', '语言': 'Language',
    '给验收用，不是游戏的一部分 · 小圆点是推荐的版本': 'For review, not part of the game · the dot marks the recommended version', '恢复推荐': 'Reset to recommended', '推荐': 'Recommended',
    // ---- the versions page (Variants: the rows' names and their versions, as each module registers them)
    '镜头': 'Camera', '人物与动作': 'Skier & motion', '人物动作（11 月 16 日评审）': 'Skier motion (16 Nov review)', '画面': 'Picture', '雪': 'Snow', '场景与天气': 'Scene & weather', '手感': 'Feel', '新加的': 'New',
    '滑具': 'Equipment', '双板': 'Skis', '单板': 'Snowboard', '光圈挑战': 'Ring challenge', '光圈难度': 'Ring difficulty',
    '追身镜头': 'Chase camera', '林间镜头': 'Camera in trees', '穿林': 'Through the trees', '树林闪烁': 'Woods flicker', '分段机位': 'Camera per run', '雪板尖机位': 'Ski-tips camera', '俯冲手位': 'Hands in a tuck', '四角模糊': 'Corner blur',
    '雪面颤动': 'Snow chatter', '风压抖动': 'Wind buffet', '人物模型': 'Skier model', '衣服': 'Clothing', '持杖': 'Pole carry', '人物动作': 'Skier motion', '动作·时序': 'Motion · timing', '板刃时序': 'Edge timing', '动作·雪杖': 'Motion · poles', '动作·头和上身': 'Motion · head and trunk', '动作·起跳和落地': 'Motion · take-off and landing', '电脑上的蓄力圈': 'Jump charge ring (keyboard)', '不显示': 'Hidden', '显示': 'Shown',
    '逆光光斑': 'Lens ghosts', '高光': 'Highlights', '夜间雪雾': 'Spray at night', '夜空颜色': 'Night sky colour', '小云': 'Small clouds',
    '雪幕高度': 'Spray height', '闪光': 'Sparkle', '雪团': 'Snow clumps', '镜头上的雪': 'Snow on the lens', '粉雪深度': 'Powder depth', '风吹雪': 'Blowing snow',
    '岩壁': 'Rock walls', '夜里的月亮': 'Moon at night', '极光': 'Aurora', '和星云轮流': 'Takes turns with nebula', '随机': 'Random', '大雪样式': 'Heavy snow style', '山脊树': 'Ridge trees', '跳台旗': 'Jump flags', '入雪深浅': 'Ski sink', '风声': 'Wind sound',
    '键盘转弯': 'Keyboard turns',
    '现在的': 'Current', '修正': 'Corrected', '身体先走': 'Body first', '和身体同步': 'With the body', '原来': 'Original', '原样': 'As was', '新的': 'New', '低机位': 'Low', '折中': 'Middle', '贴近': 'Closer', '原位淡树': 'Fade trees', '树会淡出': 'Trees fade out', '树留着': 'Trees stay', '原来（逐帧颗粒）': 'Original (grain every frame)', '稳定': 'Steady',
    '不变': 'Fixed', '按路段大变': 'Big', '轻微变化': 'Subtle', '贴板': 'On the ski', '大腿': 'Thigh', '头盔': 'Helmet', '压低': 'Low', '面前': 'In front',
    '无': 'None', '轻': 'Light', '明显': 'Strong', '关': 'Off', '开': 'On', '有': 'On', '更强': 'Stronger', '没有': 'None', '真实': 'Realistic', '多一些': 'More', '再多一点': 'Even more',
    '没有冰晶群': 'No swarms', '水珠': 'Droplets', '白雪被吹走': 'Blown off', '先白后化': 'Melts', '平整': 'Smooth', '自然': 'Natural', '厚实': 'Thick',
    '手在前': 'Hands forward', '更舒展': 'Looser', '渐白': 'Roll to white', '暗蓝头灯': 'Headlamp blue', '月光亮些': 'Moonlit', '收': 'Toned', '更收': 'More toned',
    '碎云': 'Broken', '去掉小云': 'None', '处处都高': 'Tall', '按雪况': 'By the snow', '浮在面上': 'On top', '没过靴子': 'Boot deep', '没过膝盖': 'Knee deep',
    '斑块': 'Patches', '岩带': 'Bands', '多岩': 'Rocky', '月牙': 'Crescent', '盈凸': 'Gibbous', '阵雪': 'Showers', '暴风雪': 'Blizzard', '风旗云杉': 'Flag spruce',
    '宽旗': 'Wide flags', '羽毛旗': 'Feather flags', '浅': 'Shallow', '适中': 'Medium', '深': 'Deep', '大一点': 'Louder', '更大': 'Loudest',
    '按半秒就搓': 'Skid after ½ s', '按两秒才搓': 'Skid after 2 s', '横过来才搓': 'Side-on only',
    '滑行手感': 'Ski feel',
    '换刃咬雪': 'Edge bite', '随雪况': 'By the snow', '两倍延迟': 'Twice the delay',
  };
  const KEY = 'coldsmoke.lang';
  const L = { EN, lang: 'zh', subs: [] };
  const norm = v => v === 'zh' || v === 'en' ? v : null;
  function browser() {
    try { const ls = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || '']; return /^zh\b/i.test(String(ls[0] || '')) ? 'zh' : 'en'; } catch (e) { return 'zh'; }
  }
  { let q = null, s = null;
    try { q = norm(new URLSearchParams(location.search).get('lang')); } catch (e) { }
    try { s = norm(localStorage.getItem(KEY)); } catch (e) { }
    // (the owner, 2026-11-22 22:15 UTC: "我本地试玩永远默认中文！": a test copy (a local file, or a page that says so: COLD_SMOKE.lang, as the
    // 一起滑 test link does) starts in Chinese whatever the browser's language; the site itself still follows the browser)
    let t = null; try { t = norm(self.COLD_SMOKE && self.COLD_SMOKE.lang) || (location.protocol === 'file:' ? 'zh' : null); } catch (e) { }
    L.lang = q || s || t || browser(); }
  L.en = () => L.lang === 'en';
  // a string as shown: the English for it in English, itself otherwise (and itself when there is no English for it yet)
  L.t = s => { if (L.lang !== 'en' || s == null) return s; const k = String(s), e = EN[k]; if (e != null) return e; const tk = k.trim(); return EN[tk] != null ? k.replace(tk, EN[tk]) : k; };
  // the page's own fixed words: every text node and label under root is noted once with its Chinese, then shown in the language of the moment
  let fixed = null;
  L.capture = function (root) {
    fixed = [];
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) { const k = n.nodeValue.trim(); if (k && EN[k] != null) fixed.push({ n, zh: n.nodeValue }); }
    for (const e of root.querySelectorAll('[aria-label],[title]')) for (const a of ['aria-label', 'title']) { const v = e.getAttribute(a); if (v && EN[v] != null) fixed.push({ e, a, zh: v }); }
    L.apply();
  };
  L.apply = function () {
    const r = document.documentElement; r.lang = L.lang === 'en' ? 'en' : 'zh-CN';
    const app = document.getElementById('app'); if (app) app.classList.toggle('en', L.lang === 'en');
    for (const f of fixed || []) { if (f.n) f.n.nodeValue = L.t(f.zh); else f.e.setAttribute(f.a, L.t(f.zh)); }
    for (const e of live) if (e.isConnected || e.parentNode) e.textContent = L.t(e.dataset.zh);
  };
  // (用户 2026-11-19 00:52 UTC: 为什么中文模式出现了 challenge？) words put on the page after capture() (the 挑战 buttons, the replay's) are
  // marked here with their Chinese, so a later language change (the menu, or the 小红书 container's saved pick) relabels them too
  const live = [];
  L.live = function (e, zh) { e.dataset.zh = zh; e.textContent = L.t(zh); if (!live.includes(e)) live.push(e); return e; };
  // the player's own pick (kept for next time); whoever shows words is told
  L.set = function (lang) {
    lang = norm(lang); if (!lang || lang === L.lang) return; L.lang = lang;
    try { localStorage.setItem(KEY, lang); } catch (e) { }
    L.apply(); for (const f of L.subs) try { f(lang); } catch (e) { console.warn(e); }
  };
  L.on = f => L.subs.push(f);
  return L;
})();
