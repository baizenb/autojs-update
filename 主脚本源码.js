"ui";

var VERSION = "1.0.42";

测试

// ==================== 项目配置区 ====================
var PROJECT_NAME = "YPX GAME TOOL";

var GAME_LIBRARY = [
    {
        name: "饿殍：明末千里行",
        pkg: "com.ZeroCreation.Starveling",
        icon: "🍂",
        funcs: [
            {name: "剧情加速", icon: "⏩", color: "#ff4d4f", desc: "对话快进x3"},
            {name: "全结局", icon: "📖", color: "#1890ff", desc: "解锁全部结局"},
            {name: "无限银两", icon: "💰", color: "#faad14", desc: "银两不消耗"},
            {name: "好感满值", icon: "❤️", color: "#e94560", desc: "角色好感度MAX"}
        ]
    }
];

// 全局状态
var currentGameIndex = 0;
var currentPkg = GAME_LIBRARY[0].pkg;
var runFlags = {};
var taskThreads = {};
var floatWin = null;
var floatExpanded = false;
var detectThread = null;
var lastClickTs = 0;
var welcomeShown = false;
var installedPkgs = {};

// 配色
var C = {
    primary: "#1a1a2e",
    accent: "#e94560",
    cardBg: "#ffffff",
    pageBg: "#f5f6fa",
    textMain: "#2d3436",
    textSub: "#636e72",
    green: "#00b894",
    red: "#d63031",
    online: "#00b894",
    offline: "#d63031",
    navBg: "#ffffff",
    navNormal: "#b2bec3",
    navActive: "#e94560"
};

// ==================== 工具函数 ====================
function now() { return new Date().toLocaleTimeString(); }

function toastSafe(text) {
    try { ui.run(function() { toast(text); }); } catch (e) {}
}

function log(msg) { console.log("[" + now() + "] " + msg); }

function dp2px(dp) {
    return Math.floor(dp * context.getResources().getDisplayMetrics().density);
}

// ==================== 位置持久化 ====================
function loadFloatPosition() {
    try {
        var storage = storages.create("YPX_TOOL_POS");
        var pos = storage.get("position");
        if (pos && typeof pos.x === "number" && typeof pos.y === "number") {
            return { x: pos.x, y: pos.y };
        }
    } catch (e) {
        log("读取位置失败: " + e);
    }
    return { x: 10, y: 140 };
}

function saveFloatPosition(x, y) {
    try {
        var storage = storages.create("YPX_TOOL_POS");
        storage.put("position", { x: x, y: y });
    } catch (e) {
        log("保存位置失败: " + e);
    }
}

// ==================== 权限检测 ====================
function checkPermissions() {
    var missing = [];
    if (!auto.service) {
        missing.push("• 无障碍服务（检测游戏前台）");
    }
    try {
        if (android.os.Build.VERSION.SDK_INT >= 23) {
            if (!android.provider.Settings.canDrawOverlays(context)) {
                missing.push("• 悬浮窗权限（显示功能面板）");
            }
        }
    } catch (e) {}
    return missing;
}

function showPermissionDialog(missing) {
    ui.run(function() {
        dialogs.build({
            title: "⚠️ 权限缺失提醒",
            titleColor: "#d48806",
            content: "以下权限未开启，脚本功能将受限：\n\n" + missing.join("\n") + "\n\n建议前往设置开启。",
            positive: "去开启",
            negative: "我知道了",
            positiveColor: "#e94560",
            cancelable: true
        }).on("positive", function() {
            try {
                app.startActivity({ action: "android.settings.ACCESSIBILITY_SETTINGS" });
            } catch (e) {
                toastSafe("请手动到系统设置开启");
            }
        }).show();
    });
}

// ==================== 欢迎弹窗 ====================
function showWelcomeDialog() {
    if (welcomeShown) return;
    welcomeShown = true;
    
    var updateLog = "【本次更新内容】\n" +
        "• 已修复已知问题\n\n" +
        "重启更新生效\n\n" +
        "请选择游戏项目，点击「启动游戏」后即可使用辅助功能。\n本脚本仅供学习交流使用。";
    
    ui.run(function() {
        dialogs.build({
            title: "欢迎使用 YPX Game Tool",
            titleColor: "#1a1a2e",
            content: updateLog,
            contentColor: "#636e72",
            positive: "我知道了",
            positiveColor: "#e94560",
            cancelable: false,
            canceledOnTouchOutside: false,
            dimAmount: 0.5
        }).show();
    });
}

// ==================== 游戏检测 ====================
function refreshInstalledPackages() {
    installedPkgs = {};
    try {
        var list = context.getPackageManager().getInstalledApplications(0);
        for (var i = 0; i < list.size(); i++) {
            installedPkgs[String(list.get(i).packageName)] = true;
        }
        log("PackageManager 获取到 " + list.size() + " 个应用");
    } catch (e) {
        log("PackageManager 失败: " + e);
    }
}

function checkGameInstalled(pkg) {
    if (!pkg) return false;
    if (installedPkgs[pkg]) return true;
    try {
        var info = context.getPackageManager().getPackageInfo(pkg, 0);
        if (info) {
            installedPkgs[pkg] = true;
            return true;
        }
    } catch (e) {}
    return false;
}

function checkGameFront(pkg) {
    if (!pkg) return false;
    try {
        if (currentPackage() === pkg) return true;
    } catch (e) {}
    try {
        var r = shell("dumpsys activity activities | grep mResumedActivity", true);
        if (r && r.code === 0 && r.result && r.result.indexOf(pkg) !== -1) return true;
    } catch (e) {}
    try {
        var r2 = shell("dumpsys window windows | grep mCurrentFocus", true);
        if (r2 && r2.code === 0 && r2.result && r2.result.indexOf(pkg) !== -1) return true;
    } catch (e) {}
    return false;
}

// ==================== 启动游戏 ====================
function launchGame(pkg) {
    if (!pkg) {
        toastSafe("包名错误");
        return false;
    }
    if (!checkGameInstalled(pkg)) {
        toastSafe("未安装该游戏，请先安装\n包名: " + pkg);
        return false;
    }
    try {
        app.launchPackage(pkg);
        toastSafe("正在启动游戏...");
        
        threads.start(function() {
            sleep(3000);
            showFloatWindow();
            sleep(500);
            ui.run(function() {
                try {
                    activity.moveTaskToBack(true);
                } catch (e) {
                    log("moveTaskToBack 失败: " + e);
                }
            });
            toastSafe("已切换到悬浮窗模式，点击小球展开");
        });
        return true;
    } catch (e) {
        toast        toastSafe("启动失败: " + e.message);
        return false;
    }
}

// ==================== Drawable 工具 ====================
function createStrokeDrawable(colorStr, radius) {
    radius = radius || 20;
    var drawable = new android.graphics.drawable.GradientDrawable();
    drawable.setShape(android.graphics.drawable.GradientDrawable.RECTANGLE);
    drawable.setCornerRadius(radius);
    drawable.setStroke(2, colors.parseColor(colorStr));
    drawable.setColor(colors.parseColor("#ffffff"));
    return drawable;
}

function createSolidDrawable(colorStr, radius) {
    radius = radius || 20;
    var drawable = new android.graphics.drawable.GradientDrawable();
    drawable.setShape(android.graphics.drawable.GradientDrawable.RECTANGLE);
    drawable.setCornerRadius(radius);
    drawable.setColor(colors.parseColor(colorStr));
    return drawable;
}

function createCardBg() {
    var d = new android.graphics.drawable.GradientDrawable();
    d.setShape(android.graphics.drawable.GradientDrawable.RECTANGLE);
    d.setCornerRadius(12);
    d.setColor(colors.parseColor("#ffffff"));
    d.setStroke(1, colors.parseColor("#e8e8e8"));
    return d;
}

// ==================== 功能开关核心 ====================
function toggleFunction(gameIdx, funcIdx, btnView) {
    var game = GAME_LIBRARY[gameIdx];
    var func = game.funcs[funcIdx];
    var key = gameIdx + "_" + funcIdx;
    
    if (!checkGameFront(game.pkg)) {
        toastSafe("请先打开【" + game.name + "】");
        return;
    }
    
    var willStart = !runFlags[key];
    
    if (runFlags[key]) {
        runFlags[key] = false;
        if (taskThreads[key]) {
            try { taskThreads[key].interrupt(); } catch (e) {}
            taskThreads[key] = null;
        }
        log(func.name + " 已停止");
    } else {
        runFlags[key] = true;
        log(func.name + " 已启动");
        
        taskThreads[key] = threads.start(function() {
            while (runFlags[key]) {
                if (!checkGameFront(game.pkg)) {
                    sleep(1000);
                    continue;
                }
                sleep(2000);
            }
        });
    }
    
    updateBtnVisual(btnView, willStart);
}

function updateBtnVisual(btnView, isRunning) {
    if (!btnView) return;
    ui.run(function() {
        try {
            var clsName = String(btnView.getClass().getName());
            if (clsName.indexOf("Button") !== -1) {
                if (isRunning) {
                    btnView.setText("关闭");
                    btnView.setTextColor(colors.parseColor("#ffffff"));
                    btnView.setBackgroundDrawable(createSolidDrawable(C.green, 16));
                } else {
                    btnView.setText("开启");
                    btnView.setTextColor(colors.parseColor(C.green));
                    btnView.setBackgroundDrawable(createStrokeDrawable(C.green, 16));
                }
            } else {
                btnView.setText(isRunning ? "● 关闭" : "○ 开启");
                btnView.setTextColor(colors.parseColor(isRunning ? "#ff6b6b" : "#00b894"));
                var bg = new android.graphics.drawable.GradientDrawable();
                bg.setCornerRadius(8);
                bg.setColor(colors.parseColor(isRunning ? "#30ff6b6b" : "#3000b894"));
                btnView.setBackgroundDrawable(bg);
            }
        } catch (e) {}
    });
}

// ==================== 主界面功能卡片（横向滑动） ====================
function buildFunctionCards(gameIndex) {
    ui.run(function() {
        var container = ui.funcContainer;
        if (!container) return;
        
        try {
            container.removeAllViews();
        } catch (e) {
            var childCount = container.getChildCount();
            for (var i = childCount - 1; i >= 0; i--) {
                try { container.removeViewAt(i); } catch (e2) {}
            }
        }
        
        var game = GAME_LIBRARY[gameIndex];
        if (!game || !game.funcs || game.funcs.length === 0) {
            var hint = new android.widget.TextView(context);
            hint.setText("暂无功能数据");
            hint.setTextSize(14);
            hint.setTextColor(colors.parseColor(C.textSub));
            hint.setGravity(android.view.Gravity.CENTER);
            hint.setPadding(dp2px(80), dp2px(80), dp2px(80), dp2px(80));
            container.addView(hint, new android.widget.LinearLayout.LayoutParams(-2, -2));
            return;
        }
        
        for (var i = 0; i < game.funcs.length; i++) {
            var func = game.funcs[i];
            var card = createMainFuncCard(gameIndex, i, func);
            var lp = new android.widget.LinearLayout.LayoutParams(dp2px(110), -2);
            lp.setMargins(dp2px(6), dp2px(8), dp2px(6), dp2px(8));
            container.addView(card, lp);
        }
    });
}

function createMainFuncCard(gameIdx, funcIdx, func) {
    var card = new android.widget.LinearLayout(context);
    card.setOrientation(android.widget.LinearLayout.VERTICAL);
    card.setGravity(android.view.Gravity.CENTER_HORIZONTAL);
    card.setPadding(dp2px(12), dp2px(16), dp2px(12), dp2px(12));
    card.setBackgroundDrawable(createCardBg());
    
    var icon = new android.widget.TextView(context);
    icon.setText(func.icon);
    icon.setTextSize(26);
    icon.setGravity(android.view.Gravity.CENTER);
    card.addView(icon, new android.widget.LinearLayout.LayoutParams(dp2px(56), dp2px(56)));
    
    var name = new android.widget.TextView(context);
    name.setText(func.name);
    name.setTextSize(12);
    name.setTextColor(colors.parseColor(C.textMain));
    name.setGravity(android.view.Gravity.CENTER);
    name.setPadding(0, dp2px(6), 0, 0);
    card.addView(name, new android.widget.LinearLayout.LayoutParams(-2, -2));
    
    var desc = new android.widget.TextView(context);
    desc.setText(func.desc);
    desc.setTextSize(10);
    desc.setTextColor(colors.parseColor(C.textSub));
    desc.setGravity(android.view.Gravity.CENTER);
    card.addView(desc, new android.widget.LinearLayout.LayoutParams(-2, -2));
    
    var btn = new android.widget.Button(context);
    var key = gameIdx + "_" + funcIdx;
    runFlags[key] = runFlags[key] || false;
    
    if (runFlags[key]) {
        btn.setText("关闭");
        btn.setTextColor(colors.parseColor("#ffffff"));
        btn.setBackgroundDrawable(createSolidDrawable(C.green, 16));
    } else {
        btn.setText("开启");
        btn.setTextColor(colors.parseColor(C.green));
        btn.setBackgroundDrawable(createStrokeDrawable(C.green, 16));
    }
    
    btn.setTextSize(11);
    btn.setPadding(0, dp2px(6), 0, dp2px(6));
    var btnLp = new android.widget.LinearLayout.LayoutParams(-1, -2);
    btnLp.setMargins(0, dp2px(10), 0, 0);
    card.addView(btn, btnLp);
    
    btn.setOnClickListener(new android.view.View.OnClickListener({
        onClick: function(v) {
            toggleFunction(gameIdx, funcIdx, btn);
        }
    }));
    
    return card;
}

// ==================== 主UI布局 ====================
ui.layout(
    <frame w="*" h="*" bg="{{C.pageBg}}">
        <!-- 首页 -->
        <vertical id="pageHome" w="*" h="*" paddingBottom="56">
            <horizontal w="*" h="56" bg="{{C.primary}}" gravity="center_vertical" padding="16 0">
                <text text="{{PROJECT_NAME}}" textColor="#ffffff" textSize="18" textStyle="bold" layout_weight="1"/>
            </horizontal>
            
            <card w="*" h="wrap_content" margin="16 12" cardCornerRadius="12" cardElevation="2" bg="#ffffff">
                <vertical padding="16 14">
                    <horizontal gravity="center_vertical">
                        <text id="dotStatus" text="●" textSize="20" textColor="{{C.offline}}"/>
                        <vertical marginLeft="12" layout_weight="1">
                            <text id="txtGameName" text="未检测到游戏" textSize="15" textColor="{{C.textMain}}" textStyle="bold"/>
                            <text id="txtGameStatus" text="请打开游戏后使用功能" textSize="12" textColor="{{C.textSub}}" marginTop="2"/>
                        </vertical>
                        <text id="txtOnline" text="离线" textSize="12" textColor="#ffffff" bg="{{C.offline}}" padding="8 4" radius="10"/>
                    </horizontal>
                    <horizontal marginTop="10" gravity="right">
                        <text id="btnLaunchGame" text="▶ 启动游戏" textSize="12" textColor="#ffffff" bg="#e94560" padding="10 6" radius="6"/>
                    </horizontal>
                </vertical>
            </card>
            
            <vertical margin="16 4" padding="12 10" bg="#ffffff" radius="10">
                <text text="当前项目" textSize="12" textColor="{{C.textSub}}"/>
                <text id="txtCurrentGame" text="饿殍：明末千里行" textSize="16" textColor="{{C.textMain}}" marginTop="4"/>
            </vertical>
            
            <text id="txtFuncTitle" text="功能列表" textSize="14" textColor="{{C.textMain}}" textStyle="bold" margin="16 12 16 4"/>
            
            <!-- 横向滑动功能卡片 -->
            <android.widget.HorizontalScrollView w="*" h="*" margin="8 0" scrollbars="none">
                <horizontal id="funcContainer" w="auto" h="wrap_content" padding="8"/>
            </android.widget.HorizontalScrollView>
        </vertical>
        
        <!-- 设置页 -->
        <vertical id="pageSetting" w="*" h="*" bg="{{C.pageBg}}" paddingBottom="56" visibility="gone">
            <horizontal w="*" h="56" bg="{{C.primary}}" gravity="center_vertical" padding="16 0">
                <text text="设置" textColor="#ffffff" textSize="18" textStyle="bold"/>
            </horizontal>
            <scroll w="*" h="*">
                <vertical padding="16">
                    <card w="*" h="wrap_content" cardCornerRadius="12" bg="#ffffff" margin="0 8">
                        <vertical padding="16">
                            <text text="通用设置" textSize="16" textColor="{{C.textMain}}" textStyle="bold"/>
                            <horizontal marginTop="12" gravity="center_vertical">
                                <text text="启动时自动检测游戏" textSize="14" textColor="{{C.textMain}}" layout_weight="1"/>
                                <Switch id="swAutoDetect" checked="true"/>
                            </horizontal>
                            <horizontal marginTop="12" gravity="center_vertical">
                                <text text="游戏退出自动停止功能" textSize="14" textColor="{{C.textMain}}" layout_weight="1"/>
                                <Switch id="swAutoStop" checked="true"/>
                            </horizontal>
                        </vertical>
                    </card>
                    
                    <card w="*" h="wrap_content" cardCornerRadius="12" bg="#ffffff" margin="0 8">
                        <vertical padding="16">
                            <text text="关于与反馈" textSize="16" textColor="{{C.textMain}}" textStyle="bold"/>
                            <text text="版本: 1.0.0" textSize="13" textColor="{{C.textSub}}" marginTop="8"/>
                            <text text="作者: YPX Team" textSize="13" textColor="{{C.textSub}}" marginTop="4"/>
                            <text id="btnQQGroup" text="💬 加入反馈QQ群：216162368" textSize="14" textColor="#ffffff" bg="#12b7f5" padding="12 10" radius="8" marginTop="12" gravity="center"/>
                        </vertical>
                    </card>
                    
                    <card w="*" h="wrap_content" cardCornerRadius="12" bg="#fffbe6" margin="0 8">
                        <vertical padding="16">
                            <text text="⚠️ 使用声明与后果" textSize="16" textColor="#d48806" textStyle="bold"/>
                            <text text="1. 本脚本仅供学习交流使用，请勿用于商业用途。" textSize="12" textColor="#ad6800" marginTop="8"/>
                            <text text="2. 使用本脚本修改游戏数据可能导致账号被封禁，开发者不承担任何责任。" textSize="12" textColor="#ad6800" marginTop="4"/>
                            <text text="3. 请遵守游戏用户协议，理性游戏，健康生活。" textSize="12" textColor="#ad6800" marginTop="4"/>
                            <text text="4. 因使用本脚本造成的任何损失，由使用者自行承担。" textSize="12" textColor="#ad6800" marginTop="4"/>
                        </vertical>
                    </card>
                </vertical>
            </scroll>
        </vertical>
        
        <!-- 底部导航栏 -->
        <horizontal w="*" h="56" bg="#ffffff" gravity="center" layout_gravity="bottom" elevation="8">
            <vertical id="navHome" layout_weight="1" gravity="center" padding="6 4">
                <text id="navHomeIcon" text="◆" textSize="18" textColor="{{C.navActive}}" gravity="center"/>
                <text id="navHomeText" text="首页" textSize="11" textColor="{{C.navActive}}" marginTop="2" gravity="center"/>
            </vertical>
            <vertical id="navUser" layout_weight="1" gravity="center" padding="6 4">
                <text id="navUserIcon" text="◎" textSize="18" textColor="{{C.navNormal}}" gravity="center"/>
                <text id="navUserText" text="用户中心" textSize="11" textColor="{{C.navNormal}}" marginTop="2" gravity="center"/>
            </vertical>
            <vertical id="navSetting" layout_weight="1" gravity="center" padding="6 4">
                <text id="navSettingIcon" text="▣" textSize="18" textColor="{{C.navNormal}}" gravity="center"/>
                <text id="navSettingText" text="设置" textSize="11" textColor="{{C.navNormal}}" marginTop="2" gravity="center"/>
            </vertical>
        </horizontal>
    </frame>
);

// ==================== 初始化 ====================
ui.txtCurrentGame.setText(GAME_LIBRARY[0].name);
buildFunctionCards(0);

// ==================== 启动游戏按钮 ====================
ui.btnLaunchGame.setOnClickListener(new android.view.View.OnClickListener({
    onClick: function() {
        launchGame(GAME_LIBRARY[currentGameIndex].pkg);
    }
}));

// ==================== QQ群按钮 ====================
ui.btnQQGroup.setOnClickListener(new android.view.View.OnClickListener({
    onClick: function() {
        var qqGroupNum = "216162368";
        try {
            app.startActivity({
                action: "android.intent.action.VIEW",
                data: "mqqapi://card/show_pslcard?src_type=internal&version=1&uin=" + qqGroupNum + "&card_type=group&source=qrcode"
            });
        } catch (e) {
            try {
                app.openUrl("https://qm.qq.com/cgi-bin/qm/qr?k=216162368");
            } catch (e2) {
                toastSafe("请先安装QQ");
            }
        }
    }
}));

// ==================== 底部导航切换 ====================
function showPage(page) {
    ui.run(function() {
        ui.pageHome.setVisibility(page === "home" ? android.view.View.VISIBLE : android.view.View.GONE);
        ui.pageSetting.setVisibility(page === "setting" ? android.view.View.VISIBLE : android.view.View.GONE);
        
        var activeColor = colors.parseColor(C.navActive);
        var normalColor = colors.parseColor(C.navNormal);
        
        ui.navHomeIcon.setTextColor(page === "home" ? activeColor : normalColor);
        ui.navHomeText.setTextColor(page === "home" ? activeColor : normalColor);
        ui.navSettingIcon.setTextColor(page === "setting" ? activeColor : normalColor);
        ui.navSettingText.setTextColor(page === "setting" ? activeColor : normalColor);
    });
}

ui.navHome.setOnClickListener(new android.view.View.OnClickListener({
    onClick: function() { showPage("home"); }
}));
ui.navUser.setOnClickListener(new android.view.View.OnClickListener({
    onClick: function() { toastSafe("用户中心开发中..."); }
}));
ui.navSetting.setOnClickListener(new android.view.View.OnClickListener({
    onClick: function() { showPage("setting"); }
}));

// ==================== 游戏前台检测线程 ====================
function startGameDetect() {
    if (detectThread) {
        try { detectThread.interrupt(); } catch (e) {}
    }
    
    refreshInstalledPackages();
    
    detectThread = threads.start(function() {
        sleep(800);
        var lastFound = false;
        
        while (true) {
            try {
                var pkg = GAME_LIBRARY[currentGameIndex].pkg;
                var found = checkGameInstalled(pkg) && checkGameFront(pkg);
                
                if (found !== lastFound) {
                    lastFound = found;
                    
                    var gameName = found ? GAME_LIBRARY[currentGameIndex].name : "未检测到游戏";
                    var statusText = found ? "游戏运行中，可使用功能" : 
                                     (checkGameInstalled(pkg) ? "游戏已安装，请打开游戏" : "未安装该游戏，请先安装");
                    var dotColor = found ? C.online : C.offline;
                    var onlineText = found ? "在线" : "离线";
                    var onlineBg = found ? C.online : C.offline;
                    
                    ui.run(function() {
                        try {
                            ui.dotStatus.setTextColor(colors.parseColor(dotColor));
                            ui.txtGameName.setText(gameName);
                            ui.txtGameStatus.setText(statusText);
                            ui.txtOnline.setText(onlineText);
                            var bgDrawable = new android.graphics.drawable.GradientDrawable();
                            bgDrawable.setCornerRadius(10);
                            bgDrawable.setColor(colors.parseColor(onlineBg));
                            ui.txtOnline.setBackgroundDrawable(bgDrawable);
                        } catch (e) {}
                    });
                }
                
                if (!found && ui.swAutoStop && ui.swAutoStop.isChecked()) {
                    for (var key in runFlags) {
                        if (runFlags[key]) {
                            runFlags[key] = false;
                            if (taskThreads[key]) {
                                try { taskThreads[key].interrupt(); } catch (e) {}
                                taskThreads[key] = null;
                            }
                        }
                    }
                }
            } catch (e) {
                log("检测线程异常: " + e);
            }
            
            sleep(2000);
        }
    });
}

// ==================== 悬浮窗吸附动画 ====================
function animateFloatTo(targetX, targetY) {
    threads.start(function() {
        var startX = floatWin.getX();
        var startY = floatWin.getY();
        var dx = targetX - startX;
        var dy = targetY - startY;
        var duration = 180;
        var startTime = Date.now();
        
        while (true) {
            var elapsed = Date.now() - startTime;
            var progress = Math.min(elapsed / duration, 1);
            progress = 1 - (1 - progress) * (1 - progress);
            
            floatWin.setPosition(
                startX + dx * progress,
                startY + dy * progress
            );
            
            if (progress >= 1) break;
            sleep(16);
        }
    });
}

// ==================== 加载圆形图标 ====================
function loadCircleIcon(imageView) {
    threads.start(function() {
        try {
            var imgPath = "/mnt/agents/upload/1000033298.jpg";
            if (!files.exists(imgPath)) {
                log("图标文件不存在: " + imgPath);
                return;
            }
            var options = new android.graphics.BitmapFactory.Options();
            options.inSampleSize = 2;
            var bitmap = android.graphics.BitmapFactory.decodeFile(imgPath, options);
            if (!bitmap) {
                log("图标解码失败");
                return;
            }
            var size = Math.min(bitmap.getWidth(), bitmap.getHeight());
            var output = android.graphics.Bitmap.createBitmap(size, size, android.graphics.Bitmap.Config.ARGB_8888);
            var canvas = new android.graphics.Canvas(output);
            var paint = new android.graphics.Paint();
            paint.setAntiAlias(true);
            paint.setFilterBitmap(true);
            paint.setDither(true);
            canvas.drawARGB(0, 0, 0, 0);
            canvas.drawCircle(size / 2, size / 2, size / 2, paint);
            paint.setXfermode(new android.graphics.PorterDuffXfermode(android.graphics.PorterDuff.Mode.SRC_IN));
            var rect = new android.graphics.Rect(0, 0, size, size);
            canvas.drawBitmap(bitmap, rect, rect, paint);
            bitmap.recycle();
            
            ui.run(function() {
                imageView.setImageBitmap(output);
            });
        } catch (e) {
            log("加载圆形图标失败: " + e);
        }
    });
}

// ==================== 悬浮窗 ====================
function showFloatWindow() {
    if (floatWin) {
        try { floatWin.close(); } catch (e) {}
        floatWin = null;
    }
    
    var game = GAME_LIBRARY[currentGameIndex];
    
    floatWin = floaty.window(
        <frame id="floatRoot" w="320" h="wrap_content">
            <!-- 展开面板 -->
            <vertical id="floatPanel" bg="#E61a1a2e" radius="16" visibility="visible">
                <!-- 标题栏 + 明显最小化按钮 -->
                <horizontal gravity="center_vertical" padding="12 10">
                    <text text="YPX TOOL" textColor="#ffffff" textSize="14" textStyle="bold" layout_weight="1"/>
                    <text id="btnMinimizeFloat" text="⊟ 收起" textColor="#ffffff" textSize="11" bg="#e94560" padding="12 7" radius="6" gravity="center" w="auto"/>
                </horizontal>
                
                <!-- 导航栏 -->
                <horizontal bg="#151528" gravity="center" padding="0 6">
                    <text id="fnHome" text="首页" textColor="#e94560" textSize="12" padding="12 4" gravity="center"/>
                    <text id="fnUser" text="用户中心" textColor="#888888" textSize="12" padding="12 4" gravity="center" marginLeft="16"/>
                    <text id="fnSetting" text="设置" textColor="#888888" textSize="12" padding="12 4" gravity="center" marginLeft="16"/>
                </horizontal>
                
                <!-- 首页：功能列表 -->
                <vertical id="fpHome" w="*" h="wrap_content" padding="10">
                    <text id="floatGameTitle" text="功能列表" textSize="13" textColor="#ffffff" textStyle="bold" marginBottom="6"/>
                    <vertical id="floatFuncContainer" w="*" h="wrap_content"/>
                </vertical>
                
                <!-- 用户中心 -->
                <vertical id="fpUser" w="*" h="wrap_content" padding="20" visibility="gone">
                    <text text="用户中心" textSize="14" textColor="#ffffff" textStyle="bold" marginBottom="10"/>
                    <text text="功能开发中，敬请期待..." textSize="12" textColor="#aaaaaa"/>
                </vertical>
                
                <!-- 设置 -->
                <vertical id="fpSetting" w="*" h="wrap_content" padding="20" visibility="gone">
                    <text text="设置" textSize="14" textColor="#ffffff" textStyle="bold" marginBottom="10"/>
                    <text text="版本: 1.0.0" textSize="12" textColor="#aaaaaa"/>
                    <text text="QQ群: 216162368" textSize="12" textColor="#aaaaaa" marginTop="4"/>
                    <text text="游戏退出自动停止: 开启" textSize="12" textColor="#aaaaaa" marginTop="4"/>
                </vertical>
            </vertical>
            
            <!-- 收起小球（可拖动） -->
            <vertical id="floatBall" w="50" h="50" bg="#e94560" radius="25" gravity="center" visibility="gone">
                <img id="floatBallImg" w="46" h="46" radius="23" scaleType="centerCrop"/>
            </vertical>
        </frame>
    );
    
    loadCircleIcon(floatWin.floatBallImg);
    
    var pos = loadFloatPosition();
    floatWin.setPosition(pos.x, pos.y);
    
    refreshFloatFunctions();
    
    floatWin.btnMinimizeFloat.click(function() {
        floatWin.floatPanel.setVisibility(android.view.View.GONE);
        floatWin.floatBall.setVisibility(android.view.View.VISIBLE);
        floatWin.setSize(50, 50);
        floatExpanded = false;
        var finalX = floatWin.getX();
        var finalY = floatWin.getY();
        if (finalX + 25 > device.width / 2) {
            finalX = device.width - 60;
        } else {
            finalX = 10;
        }
        animateFloatTo(finalX, finalY);
        saveFloatPosition(finalX, finalY);
    });
    
    floatWin.fnHome.click(function() { switchFloatPage("home"); });
    floatWin.fnUser.click(function() { switchFloatPage("user"); });
    floatWin.fnSetting.click(function() { switchFloatPage("setting"); });
    
    floatWin.floatBall.click(function() {
        floatWin.floatBall.setVisibility(android.view.View.GONE);
        floatWin.floatPanel.setVisibility(android.view.View.VISIBLE);
        floatWin.setSize(320, -2);
        floatExpanded = true;
    });
    
    var dragX = 0, dragY = 0, isMoved = false;
    floatWin.floatRoot.setOnTouchListener(new android.view.View.OnTouchListener({
        onTouch: function(v, event) {
            switch (event.getAction()) {
                case event.ACTION_DOWN:
                    dragX = event.getRawX() - floatWin.getX();
                    dragY = event.getRawY() - floatWin.getY();
                    isMoved = false;
                    return true;
                case event.ACTION_MOVE:
                    var nx = event.getRawX() - dragX;
                    var ny = event.getRawY() - dragY;
                    if (Math.abs(nx - floatWin.getX()) > 2 || Math.abs(ny - floatWin.getY()) > 2) {
                        isMoved = true;
                    }
                    floatWin.setPosition(nx, ny);
                    return true;
                case event.ACTION_UP:
                    if (isMoved) {
                        var finalX = floatWin.getX();
                        var finalY = floatWin.getY();
                        var w = floatExpanded ? 320 : 50;
                        var h = floatExpanded ? 400 : 50;
                        
                        if (finalX + w / 2 > device.width / 2) {
                            finalX = device.width - w - 10;
                        } else {
                            finalX = 10;
                        }
                        
                        if (finalY < 80) finalY = 80;
                        if (finalY > device.height - h - 80) finalY = device.height - h - 80;
                        
                        animateFloatTo(finalX, finalY);
                        saveFloatPosition(finalX, finalY);
                        return true;
                    }
                    return false;
            }
            return false;
        }
    }));
    
    floatExpanded = true;
    log("悬浮窗已创建，项目: " + game.name);
}

// 刷新悬浮窗功能列表
function refreshFloatFunctions() {
    if (!floatWin) return;
    
    var container = floatWin.floatFuncContainer;
    var titleView = floatWin.floatGameTitle;
    if (!container || !titleView) return;
    
    try {
        container.removeAllViews();
    } catch (e) {
        try {
            var cc = container.getChildCount();
            for (var i = cc - 1; i >= 0; i--) {
                container.removeViewAt(i);
            }
        } catch (e2) {}
    }
    
    var game = GAME_LIBRARY[currentGameIndex];
    if (!game || !game.funcs || game.funcs.length === 0) {
        titleView.setText("暂无功能");
        return;
    }
    
    titleView.setText(game.name);
    
    var row = null;
    for (var i = 0; i < game.funcs.length; i++) {
        if (i % 3 === 0) {
            row = new android.widget.LinearLayout(context);
            row.setOrientation(android.widget.LinearLayout.HORIZONTAL);
            row.setLayoutParams(new android.widget.LinearLayout.LayoutParams(-1, -2));
            container.addView(row);
        }
        
        var func = game.funcs[i];
        var card = createFloatFuncCard(currentGameIndex, i, func);
        var lp = new android.widget.LinearLayout.LayoutParams(0, -2, 1);
        lp.setMargins(5, 5, 5, 5);
        row.addView(card, lp);
    }
}

// 悬浮窗内白色功能卡片
function createFloatFuncCard(gameIdx, funcIdx, func) {
    var card = new android.widget.LinearLayout(context);
    card.setOrientation(android.widget.LinearLayout.VERTICAL);
    card.setGravity(android.view.Gravity.CENTER_HORIZONTAL);
    card.setPadding(10, 14, 10, 10);
    card.setBackgroundDrawable(createCardBg());
    
    var icon = new android.widget.TextView(context);
    icon.setText(func.icon);
    icon.setTextSize(22);
    icon.setGravity(android.view.Gravity.CENTER);
    card.addView(icon, new android.widget.LinearLayout.LayoutParams(50, 50));
    
    var name = new android.widget.TextView(context);
    name.setText(func.name);
    name.setTextSize(11);
    name.setTextColor(colors.parseColor(C.textMain));
    name.setGravity(android.view.Gravity.CENTER);
    name.setPadding(0, 6, 0, 0);
    card.addView(name, new android.widget.LinearLayout.LayoutParams(-2, -2));
    
    var key = gameIdx + "_" + funcIdx;
    var btn = new android.widget.Button(context);
    var isRunning = runFlags[key] || false;
    
    btn.setText(isRunning ? "关闭" : "开启");
    btn.setTextSize(10);
    btn.setPadding(0, 5, 0, 5);
    var btnLp = new android.widget.LinearLayout.LayoutParams(-1, -2);
    btnLp.setMargins(0, 8, 0, 0);
    card.addView(btn, btnLp);
    
    if (isRunning) {
        btn.setTextColor(colors.parseColor("#ffffff"));
        btn.setBackgroundDrawable(createSolidDrawable(C.green, 12));
    } else {
        btn.setTextColor(colors.parseColor(C.green));
        btn.setBackgroundDrawable(createStrokeDrawable(C.green, 12));
    }
    
    btn.setOnClickListener(new android.view.View.OnClickListener({
        onClick: function(v) {
            toggleFunction(gameIdx, funcIdx, btn);
        }
    }));
    
    return card;
}

// 悬浮窗内页面切换
function switchFloatPage(page) {
    if (!floatWin) return;
    
    var activeColor = colors.parseColor("#e94560");
    var normalColor = colors.parseColor("#888888");
    
    ui.run(function() {
        floatWin.fpHome.setVisibility(page === "home" ? android.view.View.VISIBLE : android.view.View.GONE);
        floatWin.fpUser.setVisibility(page === "user" ? android.view.View.VISIBLE : android.view.View.GONE);
        floatWin.fpSetting.setVisibility(page === "setting" ? android.view.View.VISIBLE : android.view.View.GONE);
        
        floatWin.fnHome.setTextColor(page === "home" ? activeColor : normalColor);
        floatWin.fnUser.setTextColor(page === "user" ? activeColor : normalColor);
        floatWin.fnSetting.setTextColor(page === "setting" ? activeColor : normalColor);
    });
}

// ==================== 退出清理 ====================
events.on("exit", function() {
    if (detectThread) try { detectThread.interrupt(); } catch (e) {}
    for (var key in taskThreads) {
        if (taskThreads[key]) try { taskThreads[key].interrupt(); } catch (e) {}
    }
    if (floatWin) try { floatWin.close(); } catch (e) {}
    log("主脚本已退出");
});

// ==================== 启动 ====================
threads.start(function() {
    sleep(600);
    
    var missing = checkPermissions();
    if (missing.length > 0) {
        showPermissionDialog(missing);
    }
    
    startGameDetect();
    showWelcomeDialog();
    log("YPX Game Tool 加载完成");
});
