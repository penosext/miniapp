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

import { openSoftKeyboard } from './softKeyboardUtils';

let globalModule: any = null;

function getGlobalModule(): any {
    if (!globalModule) {
        try {
            const gm = require('global');
            if (gm && gm.Global) {
                globalModule = new gm.Global();
            }
        } catch (_) {}
    }
    return globalModule;
}

export function isSystemKeyboardAvailable(): boolean {
    const gm = getGlobalModule();
    return !!(gm && typeof gm.startTextEdit === 'function');
}

export function promptSystemKeyboard(
    get: () => string,
    set: (value: string) => void
) {
    const gm = getGlobalModule();

    if (gm && typeof gm.startTextEdit === 'function') {
        const currentText = get();
        const config = {
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
        };
        const uuid = gm.startTextEdit(JSON.stringify(config));

        if (typeof uuid === 'string' && uuid.length > 0) {
            const handler = (retUuid: string, jsonData: string) => {
                if (retUuid !== uuid) return;
                try {
                    const result = JSON.parse(jsonData);
                    if (result.editConfirmed) {
                        const text = (result.text || '');
                        if (gm.closeTextEdit) {
                            gm.closeTextEdit(uuid);
                        }
                        if (gm.textEditFinished) {
                            gm.textEditFinished.off(handler);
                        }
                        set(text);
                    }
                } catch (_) {}
            };

            if (gm.textEditFinished) {
                gm.textEditFinished.on(handler);
            }
            return;
        }
    }

    openSoftKeyboard(get, set);
}
