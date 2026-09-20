import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { useAppStore } from '../store/appStore'
import { toast } from './Toasts'

export function ChannelDialog({
  channelId,
  onClose
}: {
  channelId: number | null // null = create
  onClose: () => void
}): React.JSX.Element {
  const loadChannels = useAppStore((s) => s.loadChannels)
  const query = useAppStore((s) => s.query)
  const [name, setName] = React.useState('')
  const [url, setUrl] = React.useState('')
  const [group, setGroup] = React.useState('')
  const [logoUrl, setLogoUrl] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [groups, setGroups] = React.useState<string[]>([])

  React.useEffect(() => {
    if (channelId === null) {
      setName(''); setUrl(''); setGroup(''); setLogoUrl('')
      return
    }
    void window.api.channels.get(channelId).then((channel) => {
      if (!channel) return
      setName(channel.name)
      setUrl(channel.url)
      setGroup(channel.groupName ?? '')
      setLogoUrl(channel.logoUrl ?? '')
    })
  }, [channelId])

  React.useEffect(() => {
    void window.api.groups.list().then((entries) => setGroups(entries.map((g) => g.name)))
  }, [])

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setBusy(true)
    try {
      if (channelId === null) {
        await window.api.channels.create({
          playlistId: query.playlistId ?? null,
          name,
          url,
          groupName: group || null,
          logoUrl: logoUrl || null
        })
        toast.success('Channel created')
      } else {
        await window.api.channels.update({
          id: channelId,
          patch: { name, url, groupName: group || null, logoUrl: logoUrl || null }
        })
        toast.success('Channel updated')
      }
      await loadChannels()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{channelId === null ? 'Add channel' : 'Edit channel'}</DialogTitle>
          <DialogDescription>Stream URL must be an http(s) address.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={(e) => void submit(e)}>
          <div className="grid gap-1.5">
            <Label htmlFor="channel-name">Name</Label>
            <Input id="channel-name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="channel-url">URL</Label>
            <Input
              id="channel-url"
              required
              type="url"
              placeholder="http://…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="channel-group">Group</Label>
            <Input
              id="channel-group"
              list="existing-groups"
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              placeholder="Optional"
            />
            <datalist id="existing-groups">
              {groups.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="channel-logo">Logo URL</Label>
            <Input
              id="channel-logo"
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {channelId === null ? 'Create' : 'Save'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}