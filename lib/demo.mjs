const item=(id,name,room,category,qty,unitBudget,status='Planejado',extra={})=>({id,name,room,category,qty,unitBudget,status,priority:'Média',paidTotal:0,paymentMethod:'',installments:1,purchaseDate:'',store:'',url:'',notes:'',parentId:null,...extra});
export const DEMO={version:1,projects:[{id:'apartment',name:'Meu primeiro apê',description:'Um novo espaço. Mil possibilidades.',icon:'⌂',budget:48000,color:'sage',due:'2026-12-15'}, {id:'beach',name:'Feriado na praia',description:'Menos correria, mais pé na areia.',icon:'☀',budget:1800,color:'sand',due:'2026-11-19'}],items:{apartment:[
item('fridge','Geladeira frost free','Cozinha','Eletrodomésticos',1,4200,'Pesquisando',{priority:'Alta',notes:'Duplex, 400 L ou mais. Conferir a largura do nicho (75 cm) e voltagem 220 V.'}),
item('oven','Forno de embutir','Cozinha','Eletrodomésticos',1,2400,'Pesquisando',{notes:'Elétrico, 220 V. Confirmar medidas com a arquiteta.'}),
item('cooktop','Cooktop 4 bocas','Cozinha','Eletrodomésticos',1,950,'Comprado',{paidTotal:849,paymentMethod:'Pix',purchaseDate:'2026-10-20',store:'Loja de exemplo',priority:'Alta'}),
item('outlets','Tomadas 20 A','Cozinha','Instalação e marcenaria',4,32,'Planejado',{priority:'Alta',notes:'Duas na bancada, uma para forno e uma para geladeira.'}),
item('cabinet','Marcenaria planejada','Cozinha','Instalação e marcenaria',1,0,'Planejado',{notes:'Orçamento dividido por módulo. O total é a soma dos subitens.'}),
item('cabinet-base','Armário inferior','Cozinha','Instalação e marcenaria',1,4600,'Planejado',{parentId:'cabinet'}),
item('cabinet-top','Armário aéreo','Cozinha','Instalação e marcenaria',1,2800,'Planejado',{parentId:'cabinet'}),
item('cabinet-tower','Torre quente','Cozinha','Instalação e marcenaria',1,2200,'Planejado',{parentId:'cabinet'}),
item('plates','Jogo de pratos · 12 peças','Cozinha','Utensílios e básicos',1,320,'Recebido',{paidTotal:279.9,paymentMethod:'Cartão de crédito',installments:2,purchaseDate:'2026-10-18',store:'Loja de exemplo'}),
item('knives','Conjunto de facas','Cozinha','Utensílios e básicos',1,180,'Planejado'),
item('glasses','Copos de vidro','Cozinha','Utensílios e básicos',6,18,'Planejado'),
item('sofa','Sofá 3 lugares','Sala de estar','Móveis',1,3800,'Pesquisando',{priority:'Alta'}),
item('rug','Tapete da sala','Sala de estar','Decoração',1,650,'Planejado'),
item('light','Luminária de piso','Sala de estar','Iluminação',1,420,'Planejado'),
item('bed','Cama queen + colchão','Quarto','Móveis',1,3200,'Comprado',{paidTotal:2990,paymentMethod:'Cartão de crédito',installments:10,purchaseDate:'2026-10-19',store:'Loja de exemplo'}),
item('curtain','Cortina blackout','Quarto','Decoração',1,480,'Planejado'),
item('mirror','Espelho oval','Banheiro','Decoração',1,390,'Recebido',{paidTotal:349,paymentMethod:'Pix',purchaseDate:'2026-10-21',store:'Loja de exemplo'}),
item('towels','Jogo de toalhas','Banheiro','Utensílios e básicos',2,140,'Planejado'),
item('desk','Mesa de trabalho','Escritório','Móveis',1,950,'Planejado'),
item('chair','Cadeira ergonômica','Escritório','Móveis',1,1600,'Pesquisando')
],beach:[
item('sunblock','Protetor solar FPS 50','Mala','Cuidados pessoais',2,65,'Planejado',{priority:'Alta'}),
item('beach-chair','Cadeira de praia','Praia','Conforto',2,145,'Pesquisando'),
item('umbrella','Guarda-sol','Praia','Conforto',1,180,'Planejado'),
item('cooler','Caixa térmica 32 L','Praia','Conforto',1,250,'Planejado'),
item('water','Água mineral 1,5 L','Mercado','Bebidas',6,4.5,'Comprado',{paidTotal:25.5,paymentMethod:'Pix',purchaseDate:'2026-10-22',store:'Mercado de exemplo'}),
item('snacks','Snacks para a viagem','Mercado','Alimentos',1,80,'Planejado')
]},offers:[]};
export function demoOffers(item){const base=item.unitBudget||1000;return [
{id:`${item.id}-offer-1`,itemId:item.id,store:'Casa & Co.',model:`${item.name} · opção essencial`,price:Math.round(base*0.86),shipping:49.9,rating:4.3,reviewCount:84,date:'2026-10-23',source:'demo',delivery:'5 a 7 dias úteis',url:''},
{id:`${item.id}-offer-2`,itemId:item.id,store:'Loja Aurora',model:`${item.name} · opção equilibrada`,price:Math.round(base*0.92),shipping:0,rating:4.7,reviewCount:312,date:'2026-10-23',source:'demo',delivery:'3 a 5 dias úteis',url:''},
{id:`${item.id}-offer-3`,itemId:item.id,store:'Marketplace',model:`${item.name} · opção premium`,price:Math.round(base*1.08),shipping:29.9,rating:4.9,reviewCount:1260,date:'2026-10-23',source:'demo',delivery:'2 a 4 dias úteis',url:''}
];}
