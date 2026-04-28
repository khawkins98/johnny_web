import { loadResourceEntry } from '../dgds/resource.mjs';
import { startProcess } from '../dgds/scripting/process.mjs';
import { StoryScenes } from './metadata/scenes.mjs';

export default class Story {
    constructor(resource) {
        this.currentDay = localStorage.getItem('currentDay') || 1;
        this.startDate = localStorage.getItem('startDate') || (new Date()).toLocaleDateString();
        this.resource = resource;
    }

    getRandomScene() {
        const numScenes = StoryScenes.length;
        const randomSceneIndex = Math.floor(Math.random() * Math.floor(numScenes));
        return StoryScenes[randomSceneIndex];
    }

    play(audioManager) {
        if (this.startDate !== (new Date()).toLocaleDateString()) {
            this.currentDay += 1;
        }
        localStorage.setItem('currentDay', this.currentDay);
        localStorage.setItem('startDate', this.startDate);

        const context = document.getElementById('canvas').getContext('2d');
        context.clearRect(0, 0, 640, 480);
        
        const mainContext = document.getElementById('mainCanvas').getContext('2d');
        mainContext.clearRect(0, 0, 640, 480);

        const scene = this.getRandomScene();
        const data = this.resource.loadEntry(scene.name);

        return new Promise((resolve) => {
            startProcess({
                type: 'ADS',
                context,
                mainContext,
                data,
                entries: this.resource.entries,
                audioManager,
                onComplete: resolve,
            });
        });
    }
};
