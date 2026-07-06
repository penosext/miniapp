// Copyright (C) 2025 wyxdlz54188
// 
// This file is part of miniapp.
// 
// miniapp is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// 
// miniapp is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
// 
// You should have received a copy of the GNU General Public License
// along with miniapp.  If not, see <https://www.gnu.org/licenses/>.

import { defineComponent } from 'vue';
import { promptSystemKeyboard } from '../../utils/systemKeyboardUtils';
import { Shell } from 'langningchen';

interface TerminalLine {
    id: string;
    type: 'command' | 'output' | 'error' | 'system';
    content: string;
    timestamp: number;
}

function stripAnsi(str: string): string {
    return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
        .replace(/\x1b\][0-9;]*[^\x07]*\x07/g, '')
        .replace(/\x1b[PX^_].*?\x1b\\/g, '')
        .replace(/\r/g, '');
}

export default defineComponent({
    data() {
        return {
            $page: {} as FalconPage<Record<string, any>>,

            inputText: '',
            isExecuting: false,
            shellInitialized: false,
            ptyActive: false,

            terminalLines: [] as TerminalLine[],
            commandHistory: [] as string[],
            historyIndex: -1,

            ptyPollTimer: null as any,
        };
    },

    mounted() {
        this.$page.$npage.setSupportBack(true);
        this.$page.$npage.on('backpressed', this.handleBackPress);
        this.initializeShell();
    },

    beforeDestroy() {
        this.$page.$npage.off('backpressed', this.handleBackPress);
        this.stopPtyPolling();
        try { Shell.closePty(); } catch (e) { /* ignore */ }
    },

    computed: {
        canExecute(): boolean {
            return this.inputText.trim().length > 0 && !this.isExecuting && this.shellInitialized;
        },
    },

    methods: {
        async initializeShell() {
            try {
                await Shell.initialize();
                this.shellInitialized = true;

                // 启动 PTY 交互终端
                const ok = Shell.openPty(80, 20);
                if (ok) {
                    this.ptyActive = true;
                    this.startPtyPolling();
                    this.addTerminalLine('system', 'Shell 已就绪（PTY 交互模式）');
                    this.addTerminalLine('system', '输入 "help" 查看帮助');
                } else {
                    this.addTerminalLine('error', 'PTY 启动失败，使用回退模式');
                }
            } catch (error: any) {
                this.shellInitialized = false;
                this.addTerminalLine('error', 'Shell 初始化失败: ' + (error.message || ''));
            }
        },

        // ── PTY 输出轮询 ──────────────────────────────────────
        startPtyPolling() {
            this.stopPtyPolling();
            this.ptyPollTimer = setInterval(() => {
                this.pollPtyOutput();
            }, 150);
        },

        stopPtyPolling() {
            if (this.ptyPollTimer) {
                clearInterval(this.ptyPollTimer);
                this.ptyPollTimer = null;
            }
        },

        pollPtyOutput() {
            if (!this.ptyActive) return;
            try {
                const text = Shell.readPty();
                if (text && text.length > 0) {
                    this.appendPtyOutput(text);
                }
                // 检测 PTY 是否存活
                if (!Shell.isPtyRunning()) {
                    this.ptyActive = false;
                    this.addTerminalLine('error', 'Shell 进程已退出');
                    this.stopPtyPolling();
                }
            } catch (e) { /* ignore */ }
        },

        appendPtyOutput(raw: string) {
            const clean = stripAnsi(raw);
            if (!clean.trim()) return;

            // 尝试合并到最后一行（避免每读一个字符就新起一行）
            const lastLine = this.terminalLines[this.terminalLines.length - 1];
            const now = Date.now();
            if (lastLine && lastLine.type === 'output' && (now - lastLine.timestamp) < 300) {
                lastLine.content += clean;
                lastLine.timestamp = now;
            } else {
                this.terminalLines.push({
                    id: `pty_${now}_${Math.random().toString(36).substr(2, 6)}`,
                    type: 'output',
                    content: clean,
                    timestamp: now,
                });
            }
            this.scrollToBottom();
        },

        // ── 命令执行 ──────────────────────────────────────────
        async executeCommand() {
            const command = this.inputText.trim();
            if (!command || this.isExecuting) return;

            // 保存到历史
            if (this.commandHistory[this.commandHistory.length - 1] !== command) {
                this.commandHistory.push(command);
            }
            this.historyIndex = this.commandHistory.length;
            this.inputText = '';

            const lowerCmd = command.split(' ')[0].toLowerCase();

            // 内置命令
            if (await this.handleBuiltin(command, lowerCmd)) return;

            // 通过 PTY 发送到真实 shell
            if (this.ptyActive) {
                Shell.writePty(command + '\n');
            } else {
                // 回退模式：使用旧的 exec
                await this.fallbackExec(command);
            }
        },

        async handleBuiltin(command: string, cmd: string): Promise<boolean> {
            switch (cmd) {
                case 'help': this.showHelp(); return true;
                case 'clear': this.clearTerminal(); return true;
                case 'reset': this.resetTerminal(); return true;
                case 'vi':
                case 'vim':
                case 'nano':
                case 'ed':
                    this.handleEditor(command); return true;
                default: return false;
            }
        },

        // 回退 exec（PTY 不可用时）
        async fallbackExec(command: string) {
            this.isExecuting = true;
            try {
                const result = await Shell.exec(command);
                if (result && result.trim()) {
                    this.addTerminalLine('output', result);
                }
            } catch (error: any) {
                this.addTerminalLine('error', '执行失败: ' + (error.message || ''));
            } finally {
                this.isExecuting = false;
            }
        },

        handleEditor(command: string) {
            const args = command.split(' ');
            if (args.length < 2) {
                this.addTerminalLine('error', '用法: ' + args[0] + ' <文件名>');
                return;
            }
            const fileName = args[1];
            let filePath = fileName.startsWith('/') ? fileName : `/userdisk/${fileName}`;
            setTimeout(() => {
                $falcon.navTo('fileEditor', { filePath, returnTo: 'shell' });
            }, 100);
        },

        // ── 终端行 ────────────────────────────────────────────
        addTerminalLine(type: TerminalLine['type'], content: string) {
            this.terminalLines.push({
                id: `line_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                type, content, timestamp: Date.now(),
            });
            this.scrollToBottom();
        },

        clearTerminal() { this.terminalLines = []; },

        resetTerminal() {
            this.stopPtyPolling();
            this.terminalLines = [];
            this.commandHistory = [];
            this.historyIndex = -1;
            this.inputText = '';
            this.ptyActive = false;
            try { Shell.closePty(); } catch (e) {}
            this.initializeShell();
        },

        scrollToBottom() {
            this.$nextTick(() => {
                const scroller = this.$refs.scroller as any;
                if (scroller && scroller.scrollTo) {
                    setTimeout(() => scroller.scrollTo({ x: 0, y: 999999, animated: false }), 50);
                }
            });
        },

        showHelp() {
            this.addTerminalLine('output', [
                '=== 命令帮助 ===',
                'help          显示帮助',
                'clear         清空终端',
                'reset         重置终端',
                'vi <文件>     编辑文本文件',
                '',
                '所有 Linux 命令均可直接执行(ls/cd/cat/ps/free/df/ping/curl 等)',
                '当前: ' + (this.ptyActive ? 'PTY 交互模式' : '回退 exec 模式'),
            ].join('\n'));
        },

        navigateHistory(direction: -1 | 1) {
            if (this.commandHistory.length === 0) return;
            if (direction === -1 && this.historyIndex > 0) this.historyIndex--;
            else if (direction === 1 && this.historyIndex < this.commandHistory.length) this.historyIndex++;
            if (this.historyIndex >= 0 && this.historyIndex < this.commandHistory.length) {
                this.inputText = this.commandHistory[this.historyIndex];
            } else if (this.historyIndex >= this.commandHistory.length) {
                this.inputText = '';
            }
        },

        openKeyboard() {
            promptSystemKeyboard(
                () => this.inputText,
                (value) => { this.inputText = value; this.$forceUpdate(); }
            );
        },

        handleBackPress() {
            if (this.inputText.trim()) { this.inputText = ''; this.$forceUpdate(); return; }
            this.$page.finish();
        },
    },
});
