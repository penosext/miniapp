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

import * as langningchen from './langningchen';

export declare class IME {
    static initialize(): Promise<void>;
    static getCandidates(rawPinyin: string): langningchen.Candidate[];
    static updateWordFrequency(pinyin: langningchen.Pinyin, hanZi: string): void;
    static splitPinyin(rawPinyin: string): langningchen.Pinyin;
}

export declare class ScanInput {
    static initialize(): Promise<void>;
    static deinitialize(): Promise<void>;
    static on(event: 'scan_input', callback: (data: string) => void): void;
}

export declare class Shell {
    static initialize(): Promise<void>;
    static exec(cmd: string): Promise<string>;
}
