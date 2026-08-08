import { useState, useRef } from 'react'
import { addPlays } from '../lib/db.js'

// Importing a Spotify Extended Streaming History export.
//
// This is the part that actually delivers what the app promises. The live API
// only ever hands back the last 50 plays; this file holds every play since the
// account was created, with the skip flags, devices and exact listening times
// the API has never exposed.

export default function ImportPanel({ onImported }) {
  const [dragging, setDragging] = useState(false)
  const [status, setStatus] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)

  async function handleFiles(fileList) {
    const files = Array.from(fileList || [])
    if (!files.length) return

    setError(null)
    setResult(null)
    setStatus('Starting')

    try {
      const { plays, stats } = await runImport(files, setStatus)

      if (!plays.length) {
        setStatus(null)
        setError(
          stats.skippedFiles.length
            ? 'No streaming history found in that file. Make sure it is the Extended Streaming History download, not the basic account data one.'
            : 'That file held no plays.',
        )
        return
      }

      setStatus(`Storing ${plays.length.toLocaleString()} plays`)
      const { added, duplicates } = await addPlays(plays)

      setStatus(null)
      setResult({ ...stats, added, duplicates, parsed: plays.length })
      await onImported()
    } catch (err) {
      setStatus(null)
      setError(err.message)
    }
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        handleFiles(e.dataTransfer.files)
      }}
      style={{
        ...box,
        borderStyle: dragging ? 'solid' : 'dashed',
        borderColor: dragging ? 'var(--white)' : 'var(--line-strong)',
      }}
    >
      <div className="eyebrow">Lifetime history</div>

      <div style={{ marginTop: '0.5rem', fontSize: '1.05rem', fontWeight: 600 }}>
        {status || 'Import a streaming history export'}
      </div>

      <p style={note}>
        Drop the <code style={code}>.zip</code> Spotify emailed, or the{' '}
        <code style={code}>Streaming_History_Audio</code> files from inside it. Everything is read in
        your browser — the file is never uploaded anywhere.
      </p>

      {error && <p style={{ ...note, color: 'var(--white)' }}>{error}</p>}

      {result && (
        <div style={{ marginTop: '1rem' }}>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
            {result.added.toLocaleString()} plays added
          </div>
          <p style={note}>
            Read {result.files} {result.files === 1 ? 'file' : 'files'} holding{' '}
            {result.total.toLocaleString()} rows. {result.podcast.toLocaleString()} podcast plays
            were left out.
            {result.duplicates > 0 && ` ${result.duplicates.toLocaleString()} were already stored.`}
          </p>
        </div>
      )}

      <div style={{ marginTop: '1rem' }}>
        <button className="primary" onClick={() => inputRef.current?.click()} disabled={Boolean(status)}>
          {status ? 'Working…' : 'Choose file'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".zip,.json"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
    </div>
  )
}

/** Hand the files to the worker and wait for it to finish. */
function runImport(files, onProgress) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../lib/workers/import.worker.js', import.meta.url), {
      type: 'module',
    })

    worker.onmessage = (event) => {
      const data = event.data
      if (data.type === 'progress') {
        onProgress(data.message)
      } else if (data.type === 'done') {
        worker.terminate()
        resolve({ plays: data.plays, stats: data.stats })
      } else if (data.type === 'error') {
        worker.terminate()
        reject(new Error(data.message))
      }
    }

    worker.onerror = (event) => {
      worker.terminate()
      reject(new Error(event.message || 'The import failed while reading the file.'))
    }

    worker.postMessage({ files })
  })
}

const box = {
  background: 'var(--surface)',
  border: '1px dashed var(--line-strong)',
  borderRadius: 'var(--radius)',
  padding: '1.25rem 1.35rem',
  transition: 'border-color 120ms ease',
}

const note = {
  color: 'var(--text-dim)',
  fontSize: '0.85rem',
  lineHeight: 1.55,
  margin: '0.6rem 0 0',
  maxWidth: '62ch',
}

const code = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '0.82em',
  color: 'var(--white)',
}
