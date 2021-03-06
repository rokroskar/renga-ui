/*
 * Copyright 2017 - Swiss Data Science Center (SDSC)
 * A partnership between École Polytechnique Fédérale de Lausanne (EPFL) and
 * Eidgenössische Technische Hochschule Zürich (ETHZ).
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import Vue from 'vue'
import Component from 'vue-class-component'
import VueFullScreenFileDrop from 'vue-full-screen-file-drop'
import 'vue-full-screen-file-drop/dist/vue-full-screen-file-drop.css'

import { GraphItem } from '../../graph-item-list/graph-item'
import { LabelsDialogComponent, RenameDialogComponent } from '../../dialogs/index'
import { addFile } from '../../../utils/renga-api'


Vue.component('file-label-dialog', LabelsDialogComponent)
Vue.component('file-rename-dialog', RenameDialogComponent)
Vue.component('file-drop', VueFullScreenFileDrop)

Component.registerHooks([
  'beforeRouteEnter',
  'beforeRouteLeave',
  'beforeRouteUpdate'
])

@Component({
    template: require('./files.html')
})
export class FilesComponent extends Vue {

    selectedFile: object = null
    progress: boolean = false
    detailsPanel: boolean = false
    url_list: string = ''
    file_versions = []
    dialog: string = null
    update = true
    snackbar: boolean = false
    snackbarTimeout: number = 2000
    infoText: string = ''

    get bucketId () {
        return parseInt(this.$route.params.id)
    }

    parser: any = json => {
                console.log('list', json)
                const array = <object[]> json
                return array.map(obj => {
                    let graphItem = new GraphItem(obj, 'resource:file_name', 'annotation:label', '')

                    // TODO: Currently, the correct display in the table relies on the order of the properties array in
                    // TODO: API response to match the order of the given headers. This should be fixed ASAP!
                    if (graphItem.properties[0].key !== 'annotation:label') {
                        graphItem.properties = [{key: 'annotation:label', value: ''}].concat(graphItem.properties)
                    }
                    return graphItem
                })



            }

    headers: any[] = [
        {
            text: 'Identifier',
            align: 'left',
            sortable: false,
            value: 'id'
          },
          { text: 'Name', value: 'name'},
          { text: 'Labels', value: 'labels', sortable: false },
          { text: 'resource:owner', value: 'resource:owner' }
        ]

    cancel() {
        this.dialog = null
    }

    success() {
        this.dialog = null
        this.update = true
        this.$parent['KGupdated'] = true
    }

    activated() {
        this.update = true
    }

    created ()  {
        this.url_list = `./api/explorer/storage/bucket/${this.$route.params.id}/files`
    }

    beforeRouteUpdate (to, from, next) {
        this.url_list = `./api/explorer/storage/bucket/${to.params.id}/files`
        next()
    }

    beforeRouteEnter (to, from, next) {
        next(vm => vm.url_list = `./api/explorer/storage/bucket/${to.params.id}/files`)
    }

    onSelect(file) {
        this.selectedFile = file

        fetch(`./api/explorer/storage/file/${file.id}/versions`,
            {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
            }
        ).then(response => {
            return response.json()
            }
        ).then(response => {
            this.file_versions = response
            this.file_versions.sort(function(a, b) { return a.properties[1].values[0].value - b.properties[1].values[0].value })
            this.detailsPanel = true
        })
    }

    onDrop(formData, files) {

        this.progress = true
        let fi = []

        for (let i = 0; i < files.length; i++) {
            fi.push(files[i])
        }

        this.processNext(fi)
    }

    processNext(files) {

        if (files.length === 0) {
            this.progress = false
            this.success()
        } else {
            let f = files.pop()
            addFile(f.name, this.bucketId, [], { fileObj: f})
            .then(() => {
                this.snackbar = true
                this.infoText = `file ${f.name} uploaded`
                this.processNext(files)
            })
        }


    }

}
