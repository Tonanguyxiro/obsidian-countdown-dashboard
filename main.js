/* main.js - 已编译版本 */
const { Plugin, ItemView, PluginSettingTab, Setting, Notice } = require('obsidian');

const VIEW_TYPE_COUNTDOWN = "countdown-dashboard-view";

const DEFAULT_SETTINGS = {
    events: []
}

const DATE_TIME_INPUT_TYPE = "datetime-local";

const normalizeDateValue = (value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    if (!trimmed) return trimmed;
    if (trimmed.includes("T")) return trimmed;
    if (trimmed.includes(" ")) return trimmed.replace(" ", "T");
    return trimmed;
};

const formatDateForInput = (value) => {
    const normalized = normalizeDateValue(value);
    if (!normalized) return "";
    const date = new Date(normalized);
    if (isNaN(date.getTime())) return normalized;
    const pad = (num) => String(num).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const formatDateForDisplay = (value) => {
    if (typeof value !== "string") return "";
    return value.replace("T", " ");
};

const isValidDateValue = (value) => {
    const normalized = normalizeDateValue(value);
    if (!normalized) return false;
    return !isNaN(new Date(normalized).getTime());
};

// 视图类：负责显示
class CountdownView extends ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.plugin = plugin;
        this.timerInterval = null;
    }

    getViewType() {
        return VIEW_TYPE_COUNTDOWN;
    }

    getDisplayText() {
        return "倒计时看板";
    }

    getIcon() {
        return "clock";
    }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass('countdown-container');

        this.renderCountdowns(container);

        // 每秒刷新
        this.timerInterval = window.setInterval(() => {
            this.renderCountdowns(container);
        }, 1000);
    }

    async onClose() {
        if (this.timerInterval) {
            window.clearInterval(this.timerInterval);
        }
    }

    renderCountdowns(container) {
        container.empty();
        const events = this.plugin.settings.events;

        if (events.length === 0) {
            const emptyEl = container.createEl("div");
            emptyEl.setText("还没有倒计时，请在插件设置中添加。");
            emptyEl.style.color = "var(--text-muted)";
            emptyEl.style.textAlign = "center";
            emptyEl.style.marginTop = "20px";
            return;
        }

        const now = new Date().getTime();

        events.forEach(event => {
            const normalizedDate = normalizeDateValue(event.date);
            const targetTime = new Date(normalizedDate).getTime();
            const diff = targetTime - now;

            const card = container.createEl("div", { cls: "countdown-card" });
            card.createEl("h3", { text: event.name, cls: "countdown-title" });

            if (isNaN(targetTime)) {
                card.createEl("div", { text: "日期无效", cls: "countdown-time finished" });
            } else if (diff <= 0) {
                card.createEl("div", { text: "时间到！🎉", cls: "countdown-time finished" });
            } else {
                const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((diff % (1000 * 60)) / 1000);
                
                const timeString = `${days}天 ${hours}时 ${minutes}分 ${seconds}秒`;
                card.createEl("div", { text: timeString, cls: "countdown-time" });
            }
            card.createEl("small", { text: formatDateForDisplay(event.date), cls: "countdown-date-hint" });
        });
    }
}

// 设置面板类：负责输入数据
class CountdownSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: '倒计时管理' });

        // 添加区域
        new Setting(containerEl)
            .setName('添加新倒计时')
            .setDesc('格式：YYYY-MM-DD HH:MM')
            .addText(text => text
                .setPlaceholder('事件名称')
                .setValue(this.newName ?? "")
                .onChange(value => this.newName = value))
            .addText(text => {
                text.setPlaceholder('日期 (2026-06-07 12:00)');
                text.inputEl.type = DATE_TIME_INPUT_TYPE;
                text.setValue(formatDateForInput(this.newDate ?? ""));
                text.onChange(value => this.newDate = value);
            })
            .addButton(btn => {
                btn.setButtonText("添加")
                   .setCta()
                   .onClick(async () => {
                       const name = (this.newName || "").trim();
                       const dateValue = (this.newDate || "").trim();
                       if (!name || !dateValue) {
                            new Notice("请填写完整信息");
                            return;
                        }
                        if (!isValidDateValue(dateValue)) {
                            new Notice("日期格式错误");
                            return;
                        }
                        this.plugin.settings.events.push({
                            id: Date.now().toString(),
                            name: name,
                            date: normalizeDateValue(dateValue)
                        });
                        await this.plugin.saveSettings();
                        this.newName = "";
                        this.newDate = "";
                        this.display(); // 刷新界面
                        new Notice("已添加");
                    });
            });

        // 列表区域
        containerEl.createEl('h3', { text: '列表' });
        this.plugin.settings.events.forEach((event, index) => {
            let updatedName = event.name;
            let updatedDate = event.date;
            const displayDate = formatDateForDisplay(event.date);
            new Setting(containerEl)
                .setName(event.name || `倒计时 ${index + 1}`)
                .setDesc(displayDate)
                .addText(text => text
                    .setPlaceholder('事件名称')
                    .setValue(event.name ?? "")
                    .onChange(value => updatedName = value))
                .addText(text => {
                    text.setPlaceholder('日期 (2026-06-07 12:00)');
                    text.inputEl.type = DATE_TIME_INPUT_TYPE;
                    text.setValue(formatDateForInput(event.date));
                    text.onChange(value => updatedDate = value);
                })
                .addButton(btn => btn
                    .setButtonText("保存")
                    .setCta()
                    .onClick(async () => {
                        const name = (updatedName || "").trim();
                        const dateValue = (updatedDate || "").trim();
                        if (!name || !dateValue) {
                            new Notice("请填写完整信息");
                            return;
                        }
                        if (!isValidDateValue(dateValue)) {
                            new Notice("日期格式错误");
                            return;
                        }
                        this.plugin.settings.events[index] = {
                            ...event,
                            name: name,
                            date: normalizeDateValue(dateValue)
                        };
                        await this.plugin.saveSettings();
                        this.display();
                        new Notice("已更新");
                    }))
                .addButton(btn => btn
                    .setButtonText("删除")
                    .setWarning()
                    .onClick(async () => {
                        this.plugin.settings.events.splice(index, 1);
                        await this.plugin.saveSettings();
                        this.display();
                    }));
        });
    }
}

// 主插件类
module.exports = class CountdownPlugin extends Plugin {
    async onload() {
        await this.loadSettings();

        // 注册视图
        this.registerView(
            VIEW_TYPE_COUNTDOWN,
            (leaf) => new CountdownView(leaf, this)
        );

        // 左侧添加一个小图标（丝带图标）
        this.addRibbonIcon('clock', '打开倒计时', () => {
            this.activateView();
        });

        this.addSettingTab(new CountdownSettingTab(this.app, this));
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async activateView() {
        const { workspace } = this.app;
        let leaf = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_COUNTDOWN);

        if (leaves.length > 0) {
            leaf = leaves[0];
        } else {
            leaf = workspace.getRightLeaf(false);
            await leaf.setViewState({ type: VIEW_TYPE_COUNTDOWN, active: true });
        }
        workspace.revealLeaf(leaf);
    }
}
