package com.dydo.prmassistant.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dydo.prmassistant.data.models.CloudConfig
import com.dydo.prmassistant.data.repository.PrmRepository
import com.dydo.prmassistant.ui.theme.DyDoOrange
import com.dydo.prmassistant.ui.theme.DyDoRed
import kotlinx.coroutines.launch

@Composable
fun LoginScreen(
    repository: PrmRepository,
    onLoginSuccess: () -> Unit
) {
    var email by remember { mutableStateOf(CloudConfig.userEmail) }
    var password by remember { mutableStateOf("") }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var isLoading by remember { mutableStateOf(false) }
    val coroutineScope = rememberCoroutineScope()

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFFF1F5F9))
            .padding(24.dp),
        contentAlignment = Alignment.Center
    ) {
        Card(
            shape = RoundedCornerShape(20.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            elevation = CardDefaults.cardElevation(defaultElevation = 8.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(28.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                // Logo & Header
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "DyDo",
                        fontSize = 32.sp,
                        fontWeight = FontWeight.Black,
                        color = DyDoRed
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = "PRM",
                        fontSize = 24.sp,
                        fontWeight = FontWeight.Bold,
                        color = DyDoOrange
                    )
                }
                Text(
                    text = "Mobil Yönetim ve Sipariş Takibi",
                    fontSize = 13.sp,
                    color = Color.Gray,
                    modifier = Modifier.padding(top = 4.dp, bottom = 24.dp)
                )

                // Input: Email
                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it },
                    label = { Text("Kullanıcı E-Posta") },
                    singleLine = true,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(modifier = Modifier.height(14.dp))

                // Input: Password
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    label = { Text("Şifre") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth()
                )

                if (errorMessage != null) {
                    Text(
                        text = errorMessage ?: "",
                        color = MaterialTheme.colorScheme.error,
                        fontSize = 12.sp,
                        modifier = Modifier.padding(top = 8.dp)
                    )
                }

                Spacer(modifier = Modifier.height(24.dp))

                // Login Button
                Button(
                    onClick = {
                        isLoading = true
                        errorMessage = null
                        coroutineScope.launch {
                            val res = repository.login(email, password)
                            isLoading = false
                            if (res.isSuccess) {
                                onLoginSuccess()
                            } else {
                                errorMessage = res.exceptionOrNull()?.message ?: "Giriş başarısız."
                            }
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = DyDoRed),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp),
                    enabled = !isLoading
                ) {
                    if (isLoading) {
                        CircularProgressIndicator(color = Color.White, modifier = Modifier.size(24.dp))
                    } else {
                        Text(text = "Giriş Yap", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                Text(
                    text = ".env dosyasındaki ortak hesap bilgisiyle eşleşir.",
                    fontSize = 11.sp,
                    color = Color.LightGray
                )
            }
        }
    }
}

