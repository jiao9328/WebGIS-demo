/* 各区县车辆密度指数（柱状图）
 * 数据源：模拟数据（人口比例 + 市中心偏高），8 区县固定种子可复现
 */
import { vehicleDensity } from '@/tools/mockData'
export const useLeftTop = () => {
      const data = vehicleDensity.map((d) => ({ type: d.name, value: d.value }));
      const green = '#00B96B';
      const yellow = '#fd7e14';
      const red = '#dc3545';
      const config = {
            xField: 'type',
            yField: 'value',
            seriesField: 'value',
            label: {
                  // 可手动配置 label 数据标签位置
                  position: 'top', // 'top', 'bottom', 'middle',
                  // 配置样式
                  style: {
                        fill: '#FFFFFF',
                        opacity: 0.6,
                  },
            },
            color: ({ value }) => {
                  if (value > 10500) {
                        return red;
                  } else if (value > 8500) {
                        return yellow;
                  } else {
                        return green;
                  }
            },
            legend: false,
            height: 270,
      };
      return {
            config,
            data
      }
}
