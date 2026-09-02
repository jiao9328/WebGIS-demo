/**
 * 天气查询（高德开放平台，key 与参考项目共用）
 * 淄博 adcode: 370300
 */
import axios from 'axios'

const KEY = import.meta.env.VITE_AMAP_KEY

export async function fetchWeather() {
  try {
    const { data } = await axios.get('https://restapi.amap.com/v3/weather/weatherInfo', {
      params: { city: '370300', key: KEY }
    })
    const lives = data.lives && data.lives[0]
    if (!lives) throw new Error('no data')
    return {
      city: lives.city,
      weather: lives.weather,
      temperature: lives.temperature_float + '℃',
      humidity: lives.humidity_float + '%',
      windDirection: lives.winddirection,
      windPower: lives.windpower + '级',
      reportTime: lives.reporttime
    }
  } catch (e) {
    console.warn('天气获取失败（可忽略，显示占位数据）：', e)
    // 占位数据（参考 2026-09 淄博气象常识）
    return {
      city: '淄博市',
      weather: '多云',
      temperature: '26℃',
      humidity: '58%',
      windDirection: '东南风',
      windPower: '3级',
      reportTime: new Date().toLocaleString('zh-CN')
    }
  }
}
