import * as React from 'react'
import { Plus, Search, Star, X } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { useAppStore } from '../store/appStore'

export function Toolbar({
  onNewChannel,
  onNewPlaylist,
  onToggleFavorites
}: {
  onNewChannel: () => void
  onNewPlaylist: () => void
  onToggleFavorites: () => void
}): React.JSX.Element {
  const query = useAppStore((s) => s.query)
  const setQuery = useAppStore((s) => s.setQuery)
  const searchRef = React.useRef<HTMLInputElement>(null)
  const [searchText, setSearchText] = React.useState('')

  // Debounced search → FTS query
  React.useEffect(() => {
    const timer = setTimeout(() => setQuery({ search: searchText || undefined }), 200)
    return () => clearTimeout(timer)
  }, [searchText, setQuery])

  // "/" focuses search
  React.useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-2">
      <div className="relative w-72">
        <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={searchRef}
          placeholder="Search channels…  ( / )"
          className="pl-8 pr-8"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
        {searchText && (
          <button
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
            onClick={() => setSearchText('')}
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <Button
        variant={query.favoritesOnly ? 'default' : 'ghost'}
        size="icon"
        onClick={onToggleFavorites}
        title="Favorites (f toggles favorite on selection)"
        aria-label="Favorites only"
      >
        <Star className="h-4 w-4" />
      </Button>

      <div className="flex-1" />

      <Button variant="secondary" size="sm" onClick={onNewPlaylist}>
        <Plus className="h-4 w-4" /> Playlist
      </Button>
      <Button variant="default" size="sm" onClick={onNewChannel}>
        <Plus className="h-4 w-4" /> Channel
      </Button>
    </div>
  )
}