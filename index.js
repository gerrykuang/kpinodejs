
var express = require('express');
const formidable = require('express-formidable')
const xlsx = require('node-xlsx')//引入模块
var fs= require('fs')
var app = express();
var pg = require('pg');
var moment = require('moment');
//query后的返回值
var returnd;
//刷新时更新reviewer
var refreshReviewer;
var twiceCommitSwitch;
//簡報者清單
var reviewerList = [];
//如果请求的数据是formdata格式，必须使用中间件express-formidable才能获取到body的数据
//'Content-Type': 'aapplication/x-www-form-urlencoded'
app.use(formidable());
console.log("服务启动成功");

// 数据库配置
var config = {
    user:"kpireview",
    database:"kpireview",
    password:"kpireview",
    port:5432,
    host:"10.60.20.70",
    // 扩展属性
    max:20, // 连接池最大连接数
    idleTimeoutMillis:3000, // 连接最大空闲时间 3s
}


/**
 * 登录接口
 *author:Gerry Kuang
 * parm:loginData.username/password
 * 1、获取当前用户信息，并判断是否在简报者表中有信息，如果有，则根据角色类型判断登入后进入哪个页面
 * 2、登录时需要获取当前简报者，如果User中途有忘记给之前的简报者打分，需要先给之前的打分，按顺序打到当前简报者处
 */
app.post('/login',async function(req,res){
    console.log("服务调用成功");
    console.log(req.fields)
    let loginData = req.fields;
    let komattendant = null;
    let sql = 'select ename,num from komattendant WHERE status=$1';
    let parm = [1];
    //查出当前简报者
    await query(sql,parm);
    komattendant = returnd[0];
    let reviewer = returnd[0];
    //查询当前User打分到哪个位置
    sql ='SELECT MAX(rapporteur) as rapporteur FROM  komjudgment WHERE JUDGERID =$1';
    parm = [loginData.username];
    await query(sql,parm);
    let komjudgment = returnd[0].rapporteur;
    console.log("当前登录者："+loginData.username);
    console.log("当前登录者打分到哪个位置："+komjudgment);
    //如果还没开始简报，查询出的当前简报者为undefined
    //则按照顺序取第一个简报者
    if(komattendant == false ||komattendant == null || komattendant == undefined){
        console.log("按照顺序取第一个简报者")
        sql ='select ename,num from komattendant WHERE status=$1 and type=$2 ORDER BY  num ASC LIMIT 1';
        parm = [0,3];
        await query(sql,parm);
        reviewer = returnd[0];
    }
    //如果当前登录者打分到第num个人num=komjudgment.num！=null，并且当前简报者的num-num>=1
    //则取num+1为当前简报者
    else if(komjudgment != null && komattendant.num - komjudgment>=1){
        //取之前未打分的简报者进行打分
        console.log("之前未打分清单");
        sql = 'select ename,num from komattendant WHERE type =$1  and num=$2';
        parm = [3,komjudgment+1]
        await query(sql,parm);
        reviewer = returnd[0];
        console.log(reviewer)
    }else if(komjudgment == null){
        komjudgment = 0;
        console.log("还未开始简报清单");
        sql = 'select ename,num from komattendant WHERE type =$1  and num=$2';
        parm = [3,komjudgment+1]
        await query(sql,parm);
        reviewer = returnd[0];
        console.log(reviewer)
    }
    sql = 'SELECT DEPTLEVEL FROM KOMATTENDANT WHERE empno=$1';
    parm = [loginData.username];
    //查询登录人角色  
    await query(sql,parm);
    let message = {};
    if(returnd[0].deptlevel == 0){//HR
        //查询出简报人结果集1、type=3；2、staus =0；3、根据演讲顺序升序排序
        await queryReviewerList(reviewer);
        message = {login:true,role:0,reviewer:reviewer,reviewerList:reviewerList};
        //console.log(message)
        res.send(message);
    }else if(returnd[0].deptlevel == 1){//厂处级
        message = {login:true,role:1,reviewer:reviewer};
        res.send(message);
    }else if(returnd[0].deptlevel == 2){//部级
        message = {login:true,role:2,reviewer:reviewer};
        res.send(message);
    }else{
        res.send(false);
    }
  })

//部级主管打分接口
app.post('/department/grade',async function(req,res){
    console.log("部级主管打分");
    let departmentGrade = req.fields;
    //插入打分信息
    let  formatDate = moment(new Date().getTime()).format('YYYY-MM-DD HH:mm:ss');
    //判断是否已完成打分
    await twiceCommit(departmentGrade.username,departmentGrade.num);
    console.log(departmentGrade)
    if(twiceCommitSwitch == false){
    console.log(twiceCommitSwitch)
    let sql = 'INSERT INTO komjudgment(judgerid,rapporteur,makescore,contentscore,trndate) VALUES ($1::varchar, $2::INTEGER, $3::INTEGER, $4::INTEGER, $5::TIMESTAMP)';
    let parm = [departmentGrade.username,departmentGrade.num,departmentGrade.make,departmentGrade.content,formatDate];
    await query(sql,parm);
    //刷新页面
    refreshReviewer = null;
        await refresh(departmentGrade.username);
        if(refreshReviewer ==null || refreshReviewer ==undefined || refreshReviewer == false){
            res.send({data:false})
        }else{
            console.log("refreshReviewer刷新页面成功：")
            console.log(refreshReviewer)
            res.send({data:true,refreshReviewer:refreshReviewer});
        
        }
    }else{
        res.send({data:false,twiceCommit:true})
    }
})

//厂处级主管打分接口
app.post('/general/grade',async function(req,res){
    console.log("厂处级主管打分");
    let generalGrade = req.fields;
    let  formatDate = moment(new Date().getTime()).format('YYYY-MM-DD HH:mm:ss');
    console.log(generalGrade)
    //判断是否已完成打分
    await twiceCommit(generalGrade.username,generalGrade.num);
    if(twiceCommitSwitch == false){
        let sql = 'INSERT INTO komjudgment(judgerid,rapporteur,kpiscore,makescore,contentscore,trndate) VALUES ($1::varchar, $2::INTEGER,$3::INTEGER, $4::INTEGER, $5::INTEGER, $6::TIMESTAMP)';
        let parm = [generalGrade.username,generalGrade.num,generalGrade.kpi,generalGrade.make,generalGrade.content,formatDate];
        await query(sql,parm);
        console.log(generalGrade);
        //刷新页面
        refreshReviewer = null;
        await refresh(generalGrade.username);
        if(refreshReviewer ==null || refreshReviewer ==undefined || refreshReviewer == false){
            res.send({data:false,refreshReviewer:false})
        }else{
            console.log("refreshReviewer刷新页面成功：")
            console.log(refreshReviewer)
            res.send({data:true,refreshReviewer:refreshReviewer});
    
        }
    }else{
        res.send({data:false,twiceCommit:true})
    }

})

//HR打分接口
app.post('/hr/grade',async function(req,res){
    console.log("HR打分");
    let hrGrade = req.fields;
    let  formatDate = moment(new Date().getTime()).format('YYYY-MM-DD HH:mm:ss');
    //判断是否已完成打分
    await twiceCommit(hrGrade.username,hrGrade.num);
    if(twiceCommitSwitch == false){
        //1.插入打分分值到komjudgment表
        let sql = 'INSERT INTO komjudgment(judgerid,rapporteur,timescore,trndate) VALUES ($1::varchar, $2::INTEGER,$3::INTEGER, $4::TIMESTAMP)';
        let parm = [hrGrade.username,hrGrade.num,hrGrade.time,formatDate];
        await query(sql,parm);
        console.log(hrGrade);
        res.send(true);
    }else{
        res.send({data:false,twiceCommit:true})
}   
})

/**
 * 页面刷新接口
 * author:Gerry Kuang
 * parm:loginData.username
 * 1、登录时需要获取当前简报者，如果User中途有忘记给之前的简报者打分，需要先给之前的打分，按顺序打到当前简报者处
 */
app.post('/refresh/reviewer',async function(req,res){ 
    console.log("页面刷新，获取reviewer");
    let reviewer = null;
    let sql = 'select ename,num from komattendant WHERE status=$1';
    let parm = [1];
    let komattendant = null;
    let loginData = req.fields.username;
    await query(sql,parm);
    //let reviewer = returnd[0].ename;
    komattendant = returnd[0];
    console.log("当前简报者信息：");
    console.log(komattendant)
    reviewer = returnd[0];
    sql ='SELECT MAX(rapporteur) as rapporteur FROM  komjudgment WHERE JUDGERID =$1'
    parm = [loginData];
    await query(sql,parm);
    let komjudgment = returnd[0].rapporteur;
    console.log("当前登录者："+loginData);

    console.log("当前登录者打分到哪个位置："+komjudgment);
    if(komjudgment !=null && komattendant.num - komjudgment>=1){
        //取之前未打分的简报者进行打分
        console.log("之前未打分清单");
        sql = 'select ename,num from komattendant WHERE type =$1  and num=$2';
        parm = [3,komjudgment+1]
        await query(sql,parm);
        reviewer = returnd[0];
        console.log(reviewer)
    }else if(komjudgment == null){
        komjudgment = 0;
        console.log("还未开始简报清单");
        sql = 'select ename,num from komattendant WHERE type =$1  and num=$2';
        parm = [3,komjudgment+1]
        await query(sql,parm);
        reviewer = returnd[0];
        console.log(reviewer)
    }
    res.send(reviewer);
})

app.post('/hr/updateReviewer',async function(req,res){
    //1.取出小程序拋送過來的數據
    let updateReviewer = req.fields;
    console.log(updateReviewer)
    let rapporteurNum;
    //2.查出hr打分到哪個簡報者
    let sql ='SELECT MAX(rapporteur) as rapporteur FROM  komjudgment WHERE JUDGERID =$1'
    let parm = [updateReviewer.username];
    await query(sql,parm);
    let message = null;
    //3.先判断是否有完成打分，如果未完成打分，返回false
    if(parseInt(updateReviewer.postNum) > parseInt(returnd[0].rapporteur) ){
        message = {status:false}
        res.send(message);
    }else{
        //4.分情況判斷是否才從第一個開始簡報
        if(returnd[0].rapporteur == null || returnd[0].rapporteur == undefined || returnd[0].rapporteur == false){
            rapporteurNum = 0;
        }else{
            rapporteurNum = parseInt(returnd[0].rapporteur);
        }
        console.log("rapporteurNum");
        console.log("當前簡報者：" + rapporteurNum);
        console.log("變更簡報者：" + updateReviewer.num);
        //5.如果變更簡報者-當前簡報者num>1，則沒有按順序選擇簡報者
        if(parseInt(updateReviewer.num) - rapporteurNum >1){
            //5.1更新num>當前簡報者且num<變更簡報者之間的簡報者num，全部加1
            sql ='UPDATE komattendant SET num=num+1 WHERE 1=1 AND num<$1 AND num>$2'
            parm = [parseInt(updateReviewer.num),rapporteurNum];
            await query(sql,parm);
            //5.2更新變更簡報者的num
            sql ='UPDATE komattendant SET num=$1 WHERE 1=1 AND ename=$2'
            parm = [parseInt(rapporteurNum)+1,updateReviewer.postBrifer];
            await query(sql,parm);
            console.log("未按順序選擇簡報人")
            //res.send({status:false});
        }
        //6.更新komattendant表，狀態更新為2(已打分)
        sql = 'UPDATE komattendant SET status=2 WHERE num =$1 ';
        parm = [parseInt(rapporteurNum)];//转换为int类型
        await query(sql,parm);
        console.log("更新已做完汇报的人的状态:成功")
        //7.更新變更簡報者的status=1
        sql = 'UPDATE komattendant SET status=1 WHERE num =$1 ';
        parm = [parseInt(rapporteurNum)+1];//转换为int类型
        await query(sql,parm);
        console.log("更新当前简报人num:")
        console.log(parseInt(rapporteurNum)+1);
        //7.查詢出未簡報者清單，拋送給小程序，更新集合
        await queryReviewerList(updateReviewer.postBrifer);
        message = {status:true,num:parseInt(rapporteurNum)+1,reviewerList:reviewerList}
        res.send(message);
    }
    
})

//查看部级主管简报者得分接口
app.post('/department/viewScore',async function(req,res){
    let viewScore = req.fields;
    //取最近三个月的数据
    let  formatDate = moment().subtract(3, "months").format("YYYY-MM-DD");
    let sql = 'SELECT a.rapporteur,b.ename,b.deptid, a.makescore,a.contentscore,(a.makescore+a.contentscore) AS total FROM komjudgment a,komattendant b WHERE 1=1 AND a.rapporteur=b.num AND judgerid= $1 AND a.trndate>$2::TIMESTAMP ORDER BY a.rapporteur ASC'
    let parm = [viewScore.username,formatDate];
    await query(sql,parm);
    if(returnd[0]== false){
        res.send({data:fasle})
    }else{
        res.send({data:true,scoreList:returnd})
    }
})

//查看厂处级主管简报者得分接口
app.post('/general/viewScore',async function(req,res){
    let viewScore = req.fields;
    //取最近三个月的数据
    let  formatDate = moment().subtract(3, "months").format("YYYY-MM-DD");
    let sql = 'SELECT a.rapporteur,b.ename,b.deptid, a.makescore,a.contentscore,a.kpiscore,(a.makescore+a.contentscore+a.kpiscore) AS total FROM komjudgment a,komattendant b WHERE 1=1 AND a.rapporteur=b.num AND judgerid= $1 AND a.trndate>$2::TIMESTAMP ORDER BY a.rapporteur ASC'
    let parm = [viewScore.username,formatDate];
    await query(sql,parm);
    if(returnd[0]== false){
        res.send({data:fasle})
    }else{
        res.send({data:true,scoreList:returnd})
    }
})

//查看HR打分接口
app.post('/hr/viewScore',async function(req,res){
    let viewScore = req.fields;
    //取最近三个月的数据
    let  formatDate = moment().subtract(3, "months").format("YYYY-MM-DD");
    let sql = 'SELECT a.rapporteur,b.ename,b.deptid,a.timescore FROM komjudgment a,komattendant b WHERE 1=1 AND a.rapporteur=b.num AND judgerid= $1 AND a.trndate>$2::TIMESTAMP ORDER BY a.rapporteur ASC'
    let parm = [viewScore.username,formatDate];
    await query(sql,parm);
    if(returnd[0]== false){
        res.send({data:fasle})
    }else{
        console.log(returnd)
        res.send({data:true,scoreList:returnd})
    }
})

//查看打分汇总
app.post('/hr/viewTotalScore',async function(req,res){
    //let viewScore = req.fields;
    //取最近三个月的数据
    let  formatDate = moment().subtract(3, "months").format("YYYY-MM-DD");
    let sql = 'SELECT cname,deptid,"Jeffkpi"+avgkpi AS kpi,avgmake,avgcontent,allscore FROM v_totalscore'
    let parm = [];
    await query(sql,parm);
    if(returnd[0]== false){
        res.send({data:fasle})
    }else{
        console.log(returnd)
        res.send({data:true,scoreList:returnd})
    }
})

//下載totalScore
app.post('/hr/downloadTotalScore',async function(req,res){
    //let viewScore = req.fields;
    //取最近三个月的数据
    let  formatDate = moment().subtract(3, "months").format("YYYY-MM-DD");
    let sql = 'SELECT cname,deptid,"Jeffkpi"+avgkpi AS kpi,avgmake,avgcontent,allscore FROM v_totalscore'
    let parm = [];
    await query(sql,parm);
    if(returnd[0]== false){
        res.send({data:fasle})
    }else{
         //rows是个从数据库里面读出来的数组，大家就把他当成一个普通的数组就ok
        let data = [] // 其实最后就是把这个数组写入excel 
        let title = ['名字','部門','kpi分數','簡報製作','報告內容','總分']//这是第一行 俗称列名 
        data.push(title) // 添加完列名 下面就是添加真正的内容了
        returnd.forEach((element) => {
            let arrInner = []
            arrInner.push(element.cname)
            arrInner.push(element.deptid)
            arrInner.push(element.kpi)
            arrInner.push(element.avgmake)
            arrInner.push(element.avgcontent)
            arrInner.push(element.allscore)
            data.push(arrInner)//data中添加的要是数组，可以将对象的值分解添加进数组，例如：['1','name','上海']
        });
        writeXls(data);
        //console.log(returnd)
        res.send({data:true})
    }
})


app.listen(801);

//连接数据库查询
function query(sql,parm){
    // 创建连接池
    var pool = new pg.Pool(config);
    return new Promise(resolve =>{
    var query = async () => { 
        returnd = {deptlevel:3};
        // 同步创建连接
        var connect = await pool.connect()
        try {
        // 同步等待结果
        var res = await connect.query(sql, parm)
        returnd = res.rows[0];
        if(res.rows[0] != undefined){
            returnd = res.rows;
            //console.log(  returnd)
        }else{
            returnd = [false];
        }
        resolve();      
        } finally {
        connect.release()
        }
       }
       query().catch(e => console.error(e.message, e.stack));
    })
}

//刷新页面function
async function refresh(loginData){
    //查出当前简报者
    let sql = 'select ename,num from komattendant WHERE status=$1';
    let parm = [1];
    let komattendant = null;
    await query(sql,parm);
    //let reviewer = returnd[0].ename;
    komattendant = returnd[0];

    //查询出当前打分者位置
    sql ='SELECT MAX(rapporteur) as rapporteur FROM  komjudgment WHERE JUDGERID =$1'
    parm = [loginData];
    await query(sql,parm);
    let komjudgment = returnd[0].rapporteur;
    console.log("当前登录者："+loginData);
    console.log("当前登录者打分到哪个位置："+komjudgment);

    //如果当前登录者打分的位置为空
    if(komjudgment !=null && komattendant.num - komjudgment>=1){
        //取之前未打分的简报者进行打分
        console.log("之前未打分清单");
        sql = 'select ename,num from komattendant WHERE type =$1  and num=$2';
        parm = [3,komjudgment+1]
        await query(sql,parm);
        refreshReviewer = returnd[0];
        console.log(refreshReviewer)
        return(refreshReviewer);
    }else if(komjudgment == null){
        komjudgment = 0;
        console.log("还未开始简报清单");
        sql = 'select ename,num from komattendant WHERE type =$1  and num=$2';
        parm = [3,komjudgment+1]
        await query(sql,parm);
        refreshReviewer = returnd[0];
        console.log(refreshReviewer)
        return(refreshReviewer);
    }else{
        //不做更新
        return(false)
    }
}

//判断是否已完成简报者打分，避免存在多打情况
async function twiceCommit(loginData,rapporteur){
    twiceCommitSwitch = false;
    let sql = 'select count(1) as count from komjudgment where judgerid||rapporteur=$1';
    let parm = [loginData+rapporteur];
    console.log(loginData)
    console.log(parm)
    await query(sql,parm);
    console.log(returnd)
    if(parseInt(returnd[0].count) >= 1){
        twiceCommitSwitch = true;
        console.log("twiceCommitSwitch:true")
        return twiceCommitSwitch;
    }else{     
        return twiceCommitSwitch;
    }
}

//查詢出未簡報者清單
async function queryReviewerList(reviewer){
    //查询出简报人结果集1、type=3；2、staus =0；3、根据演讲顺序升序排序
    let sql = 'SELECT ename,num FROM komattendant WHERE  type =$1 AND status !=$2 ORDER BY num ASC';
    let parm = [3,2];
    await query(sql,parm);
    reviewerList = [];
    for(let i=0;i<returnd.length;i++){
        if(returnd[i].ename == reviewer){
            reviewerList.unshift(returnd[i].ename)
        }else{
            reviewerList.push(returnd[i].ename)
        }           
    }
    return reviewerList;
}

//生成excel
function writeXls(datas) {
    let buffer = xlsx.build([
     {
      name:'sheet1',
      data:datas
     }
    ]);
    fs.writeFileSync('./download/totalScore.xlsx',buffer,{'flag':'w'});//生成excel the_content是excel的名字，大家可以随意命名
}