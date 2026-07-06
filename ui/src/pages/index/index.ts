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
    
import { defineComponent } from 'vue';

export type indexOptions = {};

const index = defineComponent({
    data() {
        return {
            $page: {} as FalconPage<indexOptions>,
        };
    },
    
    methods: {
        PenTerm() {
            $falcon.navTo("shell", {});
        },
        Backup() {
            $falcon.navTo("backup", {});
        },
        Store() {
            $falcon.navTo("store", {});
        },
        Misc() {
            $falcon.navTo("misc", {});
        },
        Deviceinfo() {
            $falcon.navTo("deviceinfo", {});
        },
        About() {
            $falcon.navTo("about", {});
        }
    }
});

export default index;
