import { AudioClip, AudioSource, director, Node, resources } from 'cc';

type MusicTrack = 'menu' | 'match';

const TRACKS: Record<MusicTrack, string> = {
  menu: 'audio/menu_bgm',
  match: 'audio/match_bgm',
};

export class MusicManager {
  private static manager: MusicManager | null = null;

  static get instance(): MusicManager {
    if (!this.manager) this.manager = new MusicManager();
    return this.manager;
  }

  private readonly node: Node;
  private readonly source: AudioSource;
  private currentTrack: MusicTrack | null = null;

  private constructor() {
    this.node = new Node('GlobalMusicPlayer');
    this.source = this.node.addComponent(AudioSource);
    this.source.loop = true;
    this.source.volume = 0.72;
    director.addPersistRootNode(this.node);
  }

  play(track: MusicTrack): void {
    if (this.currentTrack === track && this.source.playing) return;
    this.currentTrack = track;
    resources.load(TRACKS[track], AudioClip, (error, clip) => {
      if (error || !clip || this.currentTrack !== track) return;
      if (this.source.playing) this.source.stop();
      this.source.clip = clip;
      this.source.loop = true;
      this.source.play();
    });
  }
}
