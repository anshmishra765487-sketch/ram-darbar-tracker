package com.example.project;

import android.content.Intent;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.View;
import android.widget.ProgressBar;
import android.widget.Toast;

import androidx.activity.EdgeToEdge;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.google.android.material.button.MaterialButton;
import com.google.android.material.textfield.TextInputEditText;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseUser;

public class second extends AppCompatActivity {

    private TextInputEditText etEmail, etPassword, etConfirm;
    private ProgressBar progressBar;
    private MaterialButton btnRegister, btnGoLogin;
    private FirebaseAuth fa;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        EdgeToEdge.enable(this);
        setContentView(R.layout.activity_second);

        View root = findViewById(R.id.root);
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            androidx.graphics.Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return insets;
        });

        etEmail = findViewById(R.id.etEmail);
        etPassword = findViewById(R.id.etPassword);
        etConfirm = findViewById(R.id.etConfirm);
        progressBar = findViewById(R.id.progressBar);
        btnRegister = findViewById(R.id.btnRegister);
        btnGoLogin = findViewById(R.id.btnGoLogin);

        fa = FirebaseAuth.getInstance();
        progressBar.setVisibility(View.GONE);

        btnRegister.setOnClickListener(v -> register());
        btnGoLogin.setOnClickListener(v -> finish());
    }

    private void register() {
        String email = text(etEmail);
        String password = text(etPassword);
        String confirm = text(etConfirm);

        if (TextUtils.isEmpty(email)) {
            etEmail.setError("Email enter karein");
            etEmail.requestFocus();
            return;
        }
        if (password.length() < 6) {
            etPassword.setError("Password kam se kam 6 characters ka ho");
            etPassword.requestFocus();
            return;
        }
        if (!password.equals(confirm)) {
            etConfirm.setError("Password match nahi ho raha");
            etConfirm.requestFocus();
            return;
        }

        setLoading(true);
        fa.createUserWithEmailAndPassword(email, password)
                .addOnCompleteListener(task -> {
                    setLoading(false);
                    if (!task.isSuccessful()) {
                        Toast.makeText(this, AuthErrors.message(task.getException()), Toast.LENGTH_LONG).show();
                        return;
                    }
                    FirebaseUser user = fa.getCurrentUser();
                    if (user == null) {
                        goToLogin();
                        return;
                    }
                    user.updateDisplayName(email.substring(0, email.indexOf('@')))
                            .addOnCompleteListener(t -> {
                                Toast.makeText(this, "Account ban gaya, ab login karein", Toast.LENGTH_LONG).show();
                                goToLogin();
                            });
                });
    }

    private void goToLogin() {
        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(intent);
        finish();
    }

    private void setLoading(boolean loading) {
        progressBar.setVisibility(loading ? View.VISIBLE : View.GONE);
        btnRegister.setEnabled(!loading);
        btnGoLogin.setEnabled(!loading);
    }

    private String text(TextInputEditText field) {
        return field.getText() == null ? "" : field.getText().toString().trim();
    }
}