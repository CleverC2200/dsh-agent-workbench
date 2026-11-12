package com.xxl.job.executor.service.jobhandler;
import com.xxl.job.core.handler.annotation.XxlJob;
import com.xxl.job.core.context.XxlJobHelper;
import com.xxl.job.core.context.XxlJobContext;
import com.google.gson.*;
import org.springframework.stereotype.Component;
import java.net.*;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.io.*;
@Component
public class GeaDetectionHandler {
 @XxlJob("geaDetectionHandler")
 public void execute() throws Exception {
  JsonObject p=JsonParser.parseString(XxlJobHelper.getJobParam()).getAsJsonObject();
  p.addProperty("runKey","xxl-"+XxlJobHelper.getJobLogFileName());
  String token=new String(Files.readAllBytes(Paths.get(System.getenv().getOrDefault("GEA_WARNING_HOME", "D:/work_project/gea-xxl-job-test"), "config", "detection-token.txt")),StandardCharsets.UTF_8).trim();
  HttpURLConnection c=(HttpURLConnection)new URL("http://127.0.0.1:18111/execute").openConnection();
  c.setRequestMethod("POST");c.setConnectTimeout(10000);c.setReadTimeout(570000);c.setDoOutput(true);c.setRequestProperty("Authorization","Bearer "+token);c.setRequestProperty("Content-Type","application/json");
  try(OutputStream out=c.getOutputStream()){out.write(p.toString().getBytes(StandardCharsets.UTF_8));}
  int code=c.getResponseCode();InputStream in=code<400?c.getInputStream():c.getErrorStream();StringBuilder result=new StringBuilder();try(BufferedReader reader=new BufferedReader(new InputStreamReader(in,StandardCharsets.UTF_8))){String line;while((line=reader.readLine())!=null)result.append(line);}
  XxlJobHelper.log("GEA detection result: "+result);
  if(code!=200)throw new IllegalStateException("GEA detection failed: "+result);
  XxlJobHelper.handleSuccess("GEA检测执行完成，预警已校验入库");
 }
}
