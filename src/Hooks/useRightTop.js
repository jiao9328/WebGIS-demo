/* 近期警情类型分布（饼图）
 * 数据源：28 条模拟警情（事故/拥堵/违章/管制/故障），固定种子可复现
 */
import { alerts } from '@/tools/mockData'
export const useRightTop = () => {
      // 按警情类型聚合
      const byType = {}
      for (const a of alerts) {
            byType[a.type] = (byType[a.type] || 0) + 1
      }
      const data = Object.entries(byType).map(([type, value]) => ({ type, value }));
      const config = {
            appendPadding: 10,
            angleField: "value",
            colorField: "type",
            radius: 0.9,
            label: {
                  type: 'spider',
                  labelHeight: 28,
                  content: '{name}\n{percentage}',
                  style: {
                        /* 设置标注的颜色 */
                        fill: '#fff',
                        stroke: 'black',
                        shadowColor: '#652e80',
                        shadowBlur: 20,
                        cursor: 'pointer'
                  }
            },
            interactions: [{ type: "element-active" }],
            data,
            height: 270,
            legend: {
                  position: 'top',
                  itemName:{
                        style:{
                              fill:"#fff"
                        }
                  }
            },
      }
      return {
            people_config: config
      }
}
