export class AudioManager {
  private sounds: Map<string, HTMLAudioElement> = new Map();
  private musicVolume: number = 0.4;
  private sfxVolume: number = 0.6;
  private enabled: boolean = true;
  private loops: Map<string, HTMLAudioElement> = new Map();

  async loadSounds(): Promise<void> {
    // Sound files are optional - gracefully handle missing files
    const soundFiles: Record<string, string> = {
      'fire_standard': '/assets/sounds/fire_standard.wav',
      'fire_machine_gun': '/assets/sounds/fire_machine_gun.wav',
      'explosion_small': '/assets/sounds/explosion_small.wav',
      'explosion_large': '/assets/sounds/explosion_large.wav',
      'explosion_nuke': '/assets/sounds/explosion_nuke.wav',
      'shield_hit': '/assets/sounds/shield_hit.wav',
      'tank_death': '/assets/sounds/tank_death.wav',
      'jump_jets': '/assets/sounds/jump_jets.wav',
      'purchase': '/assets/sounds/purchase.wav',
      'round_start': '/assets/sounds/round_start.wav',
      'blitz': '/assets/sounds/blitz.wav',
      'groovy': '/assets/sounds/groovy.wav',
      'music_title': '/assets/sounds/music_title.mp3',
      'music_game': '/assets/sounds/music_game.mp3',
      'music_shop': '/assets/sounds/music_shop.mp3',
    };

    const loadPromises = Object.entries(soundFiles).map(async ([name, path]) => {
      try {
        const audio = new Audio();
        audio.src = path;
        audio.preload = 'auto';
        this.sounds.set(name, audio);
      } catch {
        // Sound file not found, skip
      }
    });

    await Promise.allSettled(loadPromises);
  }

  play(soundName: string, volume: number = 1): void {
    if (!this.enabled) return;
    const sound = this.sounds.get(soundName);
    if (sound) {
      try {
        const clone = sound.cloneNode() as HTMLAudioElement;
        clone.volume = Math.min(1, volume * this.sfxVolume);
        clone.play().catch(() => {});  // Ignore autoplay errors
      } catch {
        // Ignore
      }
    }
  }

  playMusic(trackName: string): void {
    if (!this.enabled) return;
    this.stopMusic();
    const music = this.sounds.get(trackName);
    if (music) {
      try {
        music.volume = this.musicVolume;
        music.loop = true;
        music.currentTime = 0;
        music.play().catch(() => {});
      } catch {
        // Ignore
      }
    }
  }

  stopMusic(): void {
    for (const [name, audio] of this.sounds) {
      if (name.startsWith('music_')) {
        try {
          audio.pause();
          audio.currentTime = 0;
        } catch {
          // Ignore
        }
      }
    }
  }

  startLoop(soundName: string, volume: number = 1): void {
    if (!this.enabled) return;
    if (this.loops.has(soundName)) return; // already playing
    const sound = this.sounds.get(soundName);
    if (sound) {
      try {
        const instance = sound.cloneNode() as HTMLAudioElement;
        instance.volume = Math.min(1, volume * this.sfxVolume);
        instance.loop = true;
        instance.play().catch(() => {});
        this.loops.set(soundName, instance);
      } catch {
        // Ignore
      }
    }
  }

  stopLoop(soundName: string): void {
    const instance = this.loops.get(soundName);
    if (instance) {
      try {
        instance.pause();
        instance.currentTime = 0;
      } catch {
        // Ignore
      }
      this.loops.delete(soundName);
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.stopMusic();
      for (const name of [...this.loops.keys()]) this.stopLoop(name);
    }
  }

  setSfxVolume(vol: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, vol));
  }

  setMusicVolume(vol: number): void {
    this.musicVolume = Math.max(0, Math.min(1, vol));
  }
}
