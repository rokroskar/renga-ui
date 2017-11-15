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
import { Watch } from 'vue-property-decorator'

import { addFile, addFileVersion, createBucket, createContext,
    getContext, getProjects, getProjectFiles, runContext } from '../../utils/renga-api'
import { findDisplayName } from '../graph/index'


// The different dialog components could probably be unified further or at
// least share some some of their templates.


class DialogBaseComponent extends Vue {
    progress: boolean = false
    projectId: number

    onSuccess() {
        this.progress = false
        this.$emit('success')
    }

    cancel() {
        this.$emit('cancel')
    }
}

class DeployerDialogComponent extends DialogBaseComponent {
    files: object[] = []

    // Need to define two arrays here because one array of objects can NOT
    // be watched (it simply won't react on when an object property is updated).
    inputSlotNames: string[] = []
    outputSlotNames: string[] = []
    inputSlotFiles: any[] = []
    outputSlotFiles: any[] = []

    getFiles() {
        this.files = []
        if (this.projectId) {
            this.addProjectFiles(this.projectId)
        } else {
            getProjects()
                .then( projects => {
                    projects.forEach( project => {
                        this.addProjectFiles(project.id)
                    })
                })
        }
    }

    addProjectFiles(projectId: number) {
        getProjectFiles(projectId)
            .then( promises => {
                promises
                    .forEach(promise => {
                        promise.then(fileArray => {
                            fileArray
                                .forEach(file => {
                                    this.files.push({
                                        file: file,
                                        text: findDisplayName(file)
                                    })
                                })
                        })
                    })
            })
    }
}



@Component({
    template: require('./project-dialog.html'),
    props: {
        projectId: {
            default: null
        }
    }
})
export class ProjectDialogComponent extends DialogBaseComponent {
    bucketName: string = 'bucket'
    bucketBackend: string = 'local'

    addBucket(): void {
        this.progress = true

        createBucket(this.bucketName, this.bucketBackend, this.projectId)
            .then(response => {
                console.log('create', response)
                this.onSuccess()

            })
    }
}


@Component({
    template: require('./context-dialog.html'),
    props: {
        projectId: {
            default: null
        }
    }
})
export class ContextDialogComponent extends DeployerDialogComponent {
    context_image: string = ''
    context_ports: string = ''
    notebooks: any[] = []
    context_notebook: any = null
    featuredImages: string[] = ['rengahub/minimal-notebook']

    mounted() {
        // Put a first empty line
        this.inputSlotNames = ['']
        this.outputSlotNames = ['']
        this.inputSlotFiles = [null]
        this.outputSlotFiles = [null]

        this.getFiles()
    }

    @Watch('context_notebook')
    onNotebookChanged() {
        this.context_image = 'rengahub/minimal-notebook'
        this.context_ports = '8888'
    }

    @Watch('context_image')
    onContextChanged(newContext) {
        if (newContext !== 'rengahub/minimal-notebook') {
            this.context_notebook = null
        }
    }

    @Watch('projectId')
    onProjectIdChanged() {
        this.getFiles()
    }

    @Watch('inputSlotNames')
    onInputsChanged() {
        appendEmpty(this.inputSlotNames, this.inputSlotFiles)
    }

    @Watch('outputSlotNames')
    onOutputsChanged() {
        appendEmpty(this.outputSlotNames, this.outputSlotFiles)
    }

    @Watch('files')
    onFilesChanged() {
        this.notebooks = this.files.filter((file: any) => file.text.slice(-6) === '.ipynb')
    }

    addContext() {
        this.progress = true

        // Leave out the dummy element '' of the inputSlot / outputSlot arrays and create the labels.
        function collectLabels(names, files, path) {
            const labels = []
            for (let i = 0; i < names.length - 1; i++) {
                let label = `renga.context.${path}.${names[i]}`
                if (files[i]) label += `=${files[i].file.id}`
                labels.push(label)
            }
            return labels
        }

        let labels = collectLabels(this.inputSlotNames, this.inputSlotFiles, 'inputs')
        labels = labels.concat(collectLabels(this.outputSlotNames, this.outputSlotFiles, 'outputs'))

        let notebookId = this.context_notebook ? this.context_notebook.file.id : null

        if (!notebookId && this.context_image.includes('rengahub/minimal-notebook')) {
            alert('You are running a notebook context without specifying a notebook file as input.' +
                'Your work will not be tracked!')
        }

        createContext(this.context_image, this.context_ports.split(/\s*,\s*/), labels,
            this.projectId, notebookId)
            .then(response => {
                console.log('create', response)
                this.onSuccess()
            })
    }

    cancel() {
        this.context_notebook = null
        this.$emit('cancel')
    }
}


@Component({
    template: require('./execution-dialog.html'),
    props: {
        contextUUID: {
            required: true
        },
        projectId: {
            default: null
        }
    }
})
export class ExecutionDialogComponent extends DeployerDialogComponent {
    engine: string = ''
    namespace: string = ''
    contextUUID: string
    interactiveOption: boolean = false
    interactive: boolean = false
    ports: string[] = []

    @Watch('projectId')
    onProjectIdChanged() {
        this.getFiles()
    }

    @Watch('engine')
    onPortsEngineChange(newEngine) {
        this.interactiveOption = newEngine === 'k8s' && this.ports.length > 0
    }

    mounted() {
        this.getFiles()

        // Build list of input- and output slots by querying the deployer API
        // For the time being, we allow only the slots without a default to be set here.
        getContext(this.contextUUID)
            .then( context => {
                this.inputSlotNames = context.spec.labels
                    .filter( label => label.includes('.inputs.') && !label.includes('='))
                    .map( label => label.replace('renga.context.inputs.', ''))

                this.outputSlotNames = context.spec.labels
                    .filter( label => label.includes('.outputs.') && !label.includes('='))
                    .map( label => label.replace('renga.context.outputs.', ''))

                this.inputSlotFiles = this.inputSlotNames.map(() => null)
                this.outputSlotFiles = this.outputSlotNames.map(() => null)
                this.ports = context.spec.ports
            })
    }

    addExec() {
        this.progress = true

        // Build a dictionary of "environment variables"
        // This works currently for all CAPITALIZED input/output slots only.
        let environment = {}

        for (let i = 0; i < this.inputSlotNames.length; i++) {
            environment[`RENGA_CONTEXT_INPUTS_${this.inputSlotNames[i]}`] = this.inputSlotFiles[i].file.id
        }
        for (let i = 0; i < this.outputSlotNames.length; i++) {
            environment[`RENGA_CONTEXT_OUTPUTS_${this.outputSlotNames[i]}`] = this.outputSlotFiles[i].file.id
        }


        runContext(this.engine, this.namespace, this.contextUUID, environment)
            .then(response => {
                console.log('create', response.json())
                this.onSuccess()
            })
    }
}


@Component({
    template: require('./bucket-dialog.html'),
    props: {
        bucketId: {
            type: Number,
            required: true
        }
    }
})
export class BucketDialogComponent extends DialogBaseComponent {
    filename: string = ''
    bucketfile: string = ''
    bucketId: number
    fileOrigin: string = 'local'
    fileUrl: string = null

    addFile() {
        this.progress = true

        let options = {}
        if (this.fileOrigin === 'local') {
          options['fileInput'] = this.$refs.fileInput
        } else if (this.fileOrigin === 'URL') {
            options['fileUrl'] = this.fileUrl
        }

        addFile(this.bucketfile, this.bucketId, options)
            .then(() => {
                this.onSuccess()
            })
    }

    onFileChange($event) {
        onFileChange($event, this)
    }

    onFocus() {
        onFocus(this)
    }
}


@Component({
    template: require('./version-dialog.html'),
    props: {
        selectedFileId: {
            type: Number,
            required: true
        }

    }
})
export class VersionDialogComponent extends DialogBaseComponent {
    filename: string = ''
    selectedFileId: number
    fileOrigin: string = 'local'
    fileUrl: string = null

    addFileVersion() {
        this.progress = true

        let options = {}
        if (this.fileOrigin === 'local') {
            options['fileInput'] = this.$refs.fileInput
        } else if (this.fileOrigin === 'URL') {
            options['fileUrl'] = this.fileUrl
        }

        addFileVersion(this.selectedFileId, options)
            .then(() => {
                this.progress = false
                this.onSuccess()
            })
    }

    onFileChange($event) {
        onFileChange($event, this)
    }

    onFocus() {
        onFocus(this)
    }
}


function onFileChange($event, context) {
    let files = $event.target.files || $event.dataTransfer.files
    if (files) {
        context.filename = ''
        for (let j = 0; j < files.length; j++) {
            context.filename += `${files[j]['name']} `
        }
    } else {
        context.filename = $event.target.value.split('\\').pop()
    }
    context.$emit('input', context.filename)
}

function onFocus(context) {
    let e = context.$refs.fileInput as HTMLElement
    e.click()
}

function appendEmpty(nameArray, fileArray) {
    let nInputs = nameArray.length
    if (nameArray[nInputs - 1] !== '') {
        nameArray.push('')
        fileArray.push(null)
    }
    if (nameArray[nInputs - 1] === '' &&
        nameArray[nInputs - 2] === '') {
        nameArray.splice(nInputs - 1, 1)
        fileArray.splice(nInputs - 1, 1)
    }
}
