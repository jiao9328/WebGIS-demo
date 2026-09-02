<template>
    <div></div>
</template>
<script setup>
import {onMounted,inject,onUnmounted} from 'vue';
let map, directionControl
onMounted(() => {
    map = inject("$scene_map").map

    directionControl = new MapboxDirections({
            accessToken: import.meta.env.VITE_MAPBOX_TOKEN,
        })
    map.addControl(directionControl)
})
onUnmounted(()=>{
    if(directionControl){
        
    map.removeControl(directionControl)
    }
})
</script>
<style>
</style>