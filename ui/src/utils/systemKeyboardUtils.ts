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

import globalMod from 'global';

let gm: any = null;

function getGM(): any {
    if (gm) return gm;

    // 通过 ES module import 加载的 global 模块 (QuickJS CModuleLoader)
    try {
        if (globalMod && typeof globalMod.Global === 'function') {
            gm = new globalMod.Global();
            if (gm && typeof gm.startTextEdit === 'function') return gm;
        }
    } catch (_) {}

    // 备用: globalThis 可能直接暴露 Global 构造函数
    try {
        const G = (globalThis as any).Global;
        if (G && typeof G === 'function') {
            gm = new G();
            if (gm && typeof gm.startTextEdit === 'function') return gm;
        }
    } catch (_) {}

    return null;
}

export function promptSystemKeyboard(
    get: () => string,
    set: (value: string) => void
) {
    const inst = getGM();
    if (!inst || typeof inst.startTextEdit !== 'function') return;

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

    if (typeof uuid !== 'string' || uuid.length === 0) return;

    const handler = (retUuid: string, jsonData: string) => {
        if (retUuid !== uuid) return;
        try {
            const result = JSON.parse(jsonData);
            if (result.editConfirmed) {
                if (inst.textEditFinished) inst.textEditFinished.off(handler);
                setTimeout(() => {
                    try { if (inst.closeTextEdit) inst.closeTextEdit(uuid); } catch (_) {}
                }, 0);
                set(result.text || '');
            }
        } catch (_) {}
    };

    if (inst.textEditFinished) inst.textEditFinished.on(handler);
}
