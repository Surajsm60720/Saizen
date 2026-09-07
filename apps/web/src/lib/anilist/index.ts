export {
  anilist,
  currentAniSeason,
  searchYearOptions,
  countActiveSearchFilters,
  DEFAULT_SEARCH_FILTERS,
  MEDIA_FORMAT_OPTIONS,
  MEDIA_STATUS_OPTIONS,
  MEDIA_SORT_OPTIONS,
  SEASON_OPTIONS,
  displayTitle,
  stripHtml,
  formatSource,
  mainStudioName,
  trailerWatchUrl
} from './client'
export type {
  AnimeMedia,
  AnimeTitle,
  AnimeCover,
  AnimeStreamingEpisode,
  AnimeAiringSchedule,
  AnimeRelationEdge,
  AnimeRelationNode,
  AnimeFuzzyDate,
  AnimeStudioEdge,
  AnimeTrailer,
  AnimeCharacterEdge,
  AnimeStaffEdge,
  AnimeRecommendation,
  AniSeason,
  MediaFormat,
  MediaStatusFilter,
  MediaSortOption,
  ListMembershipFilter,
  AnimeSearchFilters,
  SearchAnimeOpts,
  SearchAnimeResult,
  AniCharacter,
  AniStaff,
  CharacterMediaEdge,
  StaffCharacterEdge,
  StaffMediaEdge
} from './client'

/** Catalog reads — AniList primary, Jikan/MAL failover. */
export {
  fetchTrending,
  fetchPopular,
  fetchSeasonPopular,
  fetchAllTimePopular,
  fetchAnime,
  fetchMedia,
  searchAnime,
  fetchAniListGenres,
  fetchCharacter,
  fetchStaff,
  fetchMediaRelations,
  fetchGenrePopular,
  fetchViewerAnimeList,
  fetchViewerListEntry,
  fetchWeekSchedule
} from '@/lib/catalog/routed'

export {
  fetchViewer,
  peekViewerListCache,
  upsertViewerListCacheEntry,
  removeViewerListCacheEntry,
  derivePrequelsSequels,
  deriveSourceMaterials,
  deriveTopGenres,
  continueEntriesFromList,
  clearViewerListCache
} from './viewer'
export type { MediaListEntry, ViewerProfile, ViewerListEntryResult } from './viewer'
export { peekHomeRails, writeHomeRails } from './homeCache'
export type { HomeRailsCache } from './homeCache'
export {
  FRANCHISE_RELATION_TYPES,
  buildFranchiseGraph,
  franchiseRelatedList,
  franchiseWatchOrder,
  listStoryRelations
} from './franchise'
export type { RelatedTitle, FranchiseGraph, FranchiseNode, FranchiseEdge } from './franchise'
export {
  fetchAiringSchedulesInRange,
  clearWeekScheduleCache
} from './schedule'
export type {
  AiringScheduleItem,
  ScheduleMedia,
  WeekScheduleResult,
  WeekScheduleMode
} from './schedule'
