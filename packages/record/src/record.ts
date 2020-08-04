import { watchers } from './watchers'
import { RecordAudio } from './audio'
import { RecordData, RecordOptions, SnapshotData, ValueOf } from '@timecat/share'
import { uninstallStore, getDBOperator } from '@timecat/utils'
import { Snapshot } from './snapshot'

const defaultRecordOpts = { mode: 'default' } as RecordOptions

function getRecorders(options: RecordOptions) {
    options = Object.assign(defaultRecordOpts, options)

    const context = options.context || window
    context.__RecordOptions__ = options

    const recorders: Array<ValueOf<typeof watchers> | typeof RecordAudio | typeof Snapshot> = [
        Snapshot,
        ...Object.values(watchers)
    ]
    if (options && options.audio) {
        recorders.push(RecordAudio)
    }
    return recorders
}

export const record = (options: RecordOptions) => {
    startRecord(options)
    return {
        unsubscribe: () => {
            Array.from(uninstallStore.values()).forEach(un => un())
        }
    }
}

async function startRecord(options: RecordOptions) {
    const db = await getDBOperator

    const allRecorders = getRecorders(options)
    let iframeWatchers = allRecorders

    // is record iframe, switch context
    if (!options || !options.context) {
        db.clear()
    } else {
        iframeWatchers = [
            Snapshot,
            watchers.MouseWatcher,
            watchers.DOMWatcher,
            watchers.FormElementWatcher,
            watchers.ScrollWatcher
        ]
    }

    iframeWatchers.forEach(watcher => {
        new watcher({
            context: (options && options.context) || window,
            emit(data: RecordData | SnapshotData) {
                if (options && options.emitter) {
                    options.emitter(data, db)
                    return
                }
                db.add(data)
            }
        })
    })

    await recordFrames()
}

export async function waitingFramesLoaded() {
    const frames = window.frames
    const tasks = Array.from(frames)
        .filter(frame => {
            try {
                const frameElement = frame.frameElement
                return frameElement.getAttribute('src')
            } catch (e) {
                console.error(`TimeCat Error: Can't record from cross-origin frame`)
                return false
            }
        })
        .map(frame => {
            const frameDocument = frame
            return new Promise(resolve => {
                frameDocument.addEventListener('load', () => {
                    resolve(frame)
                })
            })
        })
    if (!tasks.length) {
        return Promise.resolve([])
    }
    return Promise.all(tasks) as Promise<Window[]>
}

export async function recordFrames() {
    const frames = await waitingFramesLoaded()
    frames.forEach(frameWindow => record({ context: frameWindow }))
}
