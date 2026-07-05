// Copyright (C) 2025 Langning Chen
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

import { showInfo } from '../components/ToastMessage';
import { showLoading, hideLoading } from '../components/Loading';

declare function require(name: string): any;

let gm: any = null;
let tried = false;

function getGM(): any {
    if (gm) return gm;
    if (tried) return null;
    tried = true;

    // 1) require('global') 直接返回的可能是实例本身
    try {
        const m = require('global');
        if (m && typeof m.startTextEdit === 'function') { gm = m; return gm; }
        if (m) {
            const G = m.Global || m.default?.Global || m.default;
            if (G && typeof G === 'function') { gm = new G(); if (gm && typeof gm.startTextEdit === 'function') return gm; }
        }
    } catch (_) {}

    // 2) globalThis 上的 Global 构造函数
    try {
        const G = (globalThis as any).Global;
        if (G && typeof G === 'function') { gm = new G(); if (gm && typeof gm.startTextEdit === 'function') return gm; }
    } catch (_) {}

    // 3) LoliAPP 的 bridge.NativeSDK
    try {
        const b = require('bridge') || (globalThis as any).bridge;
        if (b && b.NativeSDK && typeof b.NativeSDK.startTextEdit === 'function') { gm = b.NativeSDK; return gm; }
        if (b && typeof b.startTextEdit === 'function') { gm = b; return gm; }
    } catch (_) {}

    return null;
}

export function promptSystemKeyboard(
    get: () => string,
    set: (value: string) => void
) {
    const inst = getGM();
    if (!inst || typeof inst.startTextEdit !== 'function') {
        showInfo('系统键盘模块未找到，请检查设备固件版本');
        return;
    }

    const currentText = get();
    const uuid = inst.startTextEdit(JSON.stringify({
        text: currentText || '',
        placeholder: '输入文字...',
        placeholderColor: '#878A99',
        autofocus: true,
        maxlength: -1,
        showCursor: true,
        cursorColor: '#0a84ff',
        cursorSize: 2,
        confirmButtonDisabledOnTextEmpty: false,
        inputType: 'EnUSPreferred',
        multiLinesEditVisible: false,
        capsLockSwitchOn: false,
        enterButtonText: '确认'
    }));

    if (typeof uuid !== 'string' || uuid.length === 0) {
        showInfo('系统键盘启动失败');
        return;
    }

    showLoading('输入中...');

    const handler = (retUuid: string, jsonData: string) => {
        if (retUuid !== uuid) return;
        try {
            const result = JSON.parse(jsonData);
            if (result.editConfirmed) {
                if (inst.textEditFinished) inst.textEditFinished.off(handler);
                setTimeout(() => {
                    try { if (inst.closeTextEdit) inst.closeTextEdit(uuid); } catch (_) {}
                }, 0);
                hideLoading();
                set(result.text || '');
            }
        } catch (_) {
            hideLoading();
        }
    };

    if (inst.textEditFinished) {
        inst.textEditFinished.on(handler);
    } else {
        showInfo('textEditFinished 事件不可用');
    }
}
