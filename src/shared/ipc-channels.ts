export const IPC = {
  // playlists
  PlaylistList: 'db:playlist:list',
  PlaylistCreate: 'db:playlist:create',
  PlaylistUpdate: 'db:playlist:update',
  PlaylistDelete: 'db:playlist:delete',
  // channels
  ChannelList: 'db:channel:list',
  ChannelGet: 'db:channel:get',
  ChannelCreate: 'db:channel:create',
  ChannelUpdate: 'db:channel:update',
  ChannelDelete: 'db:channel:delete',
  ChannelFavorite: 'db:channel:favorite',
  GroupList: 'db:group:list',
  // import
  ImportPreview: 'import:preview',
  ImportRun: 'import:run',
  ImportCancel: 'import:cancel',
  // streaming
  StreamProbe: 'stream:probe',
  StreamStart: 'stream:start',
  StreamStop: 'stream:stop',
  StreamStatus: 'stream:status',
  // misc
  DialogPickFile: 'dialog:pick-file',
  AppCapabilities: 'app:capabilities',
  SettingsGet: 'settings:get',
  SettingsSet: 'settings:set'
} as const

export const IPC_EVENT = {
  StreamEvent: 'evt:stream',
  ImportProgress: 'evt:import'
} as const