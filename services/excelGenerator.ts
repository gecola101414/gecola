import { Article, Category, ProjectInfo, Measurement } from '../types';

const getWbsNumber = (code: string) => {
    const match = code.match(/WBS\.(\d+)/);
    return match ? parseInt(match[1], 10) : code;
};

export const generateComputoExcel = (projectInfo: ProjectInfo, categories: Category[], articles: Article[]) => {
  const fileName = `${projectInfo.title.replace(/\s+/g, '_')}_Computo.xls`;
  
  let xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Bottom"/>
   <Borders/>
   <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Color="#000000"/>
   <Interior/>
   <NumberFormat/>
   <Protection/>
  </Style>
  <Style ss:ID="Header">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#000000" ss:Bold="1"/>
   <Interior ss:Color="#E0E0E0" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="WbsRow">
   <Alignment ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1"/>
   <Interior ss:Color="#F5F5F5" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="ArticleHeader">
   <Alignment ss:Vertical="Top" ss:WrapText="1"/>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1"/>
  </Style>
  <Style ss:ID="ArticleDesc">
   <Alignment ss:Vertical="Top" ss:WrapText="1" ss:Horizontal="Justify"/>
   <Font ss:FontName="Times New Roman" ss:Size="10"/>
  </Style>
  <Style ss:ID="MeasHeader">
   <Alignment ss:Vertical="Center" ss:Horizontal="Left"/>
   <Font ss:FontName="Calibri" ss:Size="8" ss:Bold="1" ss:Color="#666666"/>
  </Style>
  <Style ss:ID="MeasRow">
   <Alignment ss:Vertical="Top" ss:WrapText="1" ss:Horizontal="Justify"/>
   <Font ss:FontName="Calibri" ss:Size="9" ss:Italic="1" ss:Color="#444444"/>
  </Style>
  <Style ss:ID="MeasValue">
   <Alignment ss:Horizontal="Right" ss:Vertical="Top"/>
   <Font ss:FontName="Courier New" ss:Size="9"/>
   <NumberFormat ss:Format="#,##0.00"/>
  </Style>
  <Style ss:ID="QtyValue">
   <Alignment ss:Horizontal="Right" ss:Vertical="Top"/>
   <Font ss:FontName="Courier New" ss:Size="9" ss:Bold="1"/>
   <NumberFormat ss:Format="#,##0.00"/>
  </Style>
  <Style ss:ID="Currency">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Bold="1"/>
   <NumberFormat ss:Format="#,##0.00"/>
  </Style>
  <Style ss:ID="TotalLabel">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#000080"/>
  </Style>
  <Style ss:ID="TotalQtyCell">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Top" ss:LineStyle="Double" ss:Weight="3"/>
   </Borders>
   <Font ss:FontName="Courier New" ss:Size="10" ss:Bold="1"/>
   <NumberFormat ss:Format="#,##0.00"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="Computo Metrico">
  <Table ss:ExpandedColumnCount="10" x:FullColumns="1" x:FullRows="1" ss:DefaultRowHeight="15">
   <Column ss:Width="40"/>
   <Column ss:Width="80"/>
   <Column ss:Width="280"/>
   <Column ss:Width="40"/>
   <Column ss:Width="45"/>
   <Column ss:Width="45"/>
   <Column ss:Width="45"/>
   <Column ss:Width="60"/>
   <Column ss:Width="70"/>
   <Column ss:Width="80"/>
   
   <Row ss:Height="25">
    <Cell ss:MergeAcross="9" ss:StyleID="WbsRow"><Data ss:Type="String">PROGETTO: ${projectInfo.title} - Committente: ${projectInfo.client}</Data></Cell>
   </Row>
   <Row ss:Height="20">
    <Cell ss:StyleID="Header"><Data ss:Type="String">N. ORD</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">TARIFFA</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">DESIGNAZIONE DEI LAVORI</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">P.UG</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">LUNG</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">LARG</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">H/P</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Q.TÀ</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">UNITARIO</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">TOTALE</Data></Cell>
   </Row>`;

  categories.forEach(cat => {
    if (!cat.isEnabled) return;
    const catArticles = articles.filter(a => a.categoryCode === cat.code);
    if (catArticles.length === 0) return;

    xml += `
   <Row ss:Height="22">
    <Cell ss:MergeAcross="9" ss:StyleID="WbsRow"><Data ss:Type="String">${cat.code} - ${cat.name}</Data></Cell>
   </Row>`;

    catArticles.forEach((art, artIdx) => {
      const artNum = `${getWbsNumber(cat.code)}.${artIdx + 1}`;
      
      xml += `
   <Row ss:AutoFitHeight="1">
    <Cell ss:StyleID="ArticleHeader"><Data ss:Type="String">${artNum}</Data></Cell>
    <Cell ss:StyleID="ArticleHeader"><Data ss:Type="String">${art.code}</Data></Cell>
    <Cell ss:StyleID="ArticleDesc"><Data ss:Type="String">${art.description}</Data></Cell>
    <Cell/><Cell/><Cell/><Cell/><Cell/><Cell/><Cell/>
   </Row>
   <Row ss:Height="12">
    <Cell/><Cell/>
    <Cell ss:StyleID="MeasHeader"><Data ss:Type="String">ELENCO DELLE MISURE:</Data></Cell>
    <Cell/><Cell/><Cell/><Cell/><Cell/><Cell/><Cell/>
   </Row>`;

      const measCount = art.measurements.length;
      art.measurements.forEach(m => {
        if (m.type === 'subtotal') {
            xml += `
   <Row ss:AutoFitHeight="1">
    <Cell/><Cell/>
    <Cell ss:StyleID="TotalLabel"><Data ss:Type="String">Sommano parziale</Data></Cell>
    <Cell/><Cell/><Cell/><Cell/>
    <Cell ss:StyleID="QtyValue"><Data ss:Type="Number">0</Data></Cell> 
    <Cell/><Cell/>
   </Row>`;
        } else {
            const sign = m.type === 'deduction' ? -1 : 1;
            const prodFormula = `=${sign}*IF(COUNT(RC[-4]:RC[-1])=0,0,PRODUCT(IF(RC[-4]=0,1,RC[-4]),IF(RC[-3]=0,1,RC[-3]),IF(RC[-2]=0,1,RC[-2]),IF(RC[-1]=0,1,RC[-1])))`;
            
            xml += `
   <Row ss:AutoFitHeight="1">
    <Cell/><Cell/>
    <Cell ss:StyleID="MeasRow"><Data ss:Type="String">${m.description}</Data></Cell>
    <Cell ss:StyleID="MeasValue">${m.multiplier !== undefined ? `<Data ss:Type="Number">${m.multiplier}</Data>` : ''}</Cell>
    <Cell ss:StyleID="MeasValue">${m.length !== undefined ? `<Data ss:Type="Number">${m.length}</Data>` : ''}</Cell>
    <Cell ss:StyleID="MeasValue">${m.width !== undefined ? `<Data ss:Type="Number">${m.width}</Data>` : ''}</Cell>
    <Cell ss:StyleID="MeasValue">${m.height !== undefined ? `<Data ss:Type="Number">${m.height}</Data>` : ''}</Cell>
    <Cell ss:StyleID="QtyValue" ss:Formula="${prodFormula}"><Data ss:Type="Number">0</Data></Cell>
    <Cell/><Cell/>
   </Row>`;
        }
      });

      const sumFormula = `=SUM(R[-${measCount}]C:R[-1]C)`;
      
      xml += `
   <Row ss:Height="18">
    <Cell/><Cell/>
    <Cell ss:StyleID="TotalLabel"><Data ss:Type="String">SOMMANO ${art.unit}</Data></Cell>
    <Cell/><Cell/><Cell/><Cell/>
    <Cell ss:StyleID="TotalQtyCell" ss:Formula="${sumFormula}"><Data ss:Type="Number">${art.quantity}</Data></Cell>
    <Cell ss:StyleID="Currency"><Data ss:Type="Number">${art.unitPrice}</Data></Cell>
    <Cell ss:StyleID="Currency" ss:Formula="=RC[-2]*RC[-1]"><Data ss:Type="Number">${art.quantity * art.unitPrice}</Data></Cell>
   </Row>
   <Row ss:Height="5"><Cell ss:MergeAcross="9"/></Row>`;
    });
  });

  xml += `
  </Table>
 </Worksheet>
</Workbook>`;

  const blob = new Blob([xml], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};